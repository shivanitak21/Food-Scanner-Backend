import {
  COUNTRY_PACKS,
  INTERNATIONAL_PACK,
  type CountryPack,
  packsMention,
  resolvePacks,
} from './countries';
import { ALLERGEN_LABELS, resolveAllergyIds } from './dictionaries';
import { canon, textIncludesTerm } from './text';
import type {
  AnalysisStatus,
  Evidence,
  NutritionFacts,
  ProfileRules,
  RuleFinding,
  RulesInput,
  RulesResult,
  Severity,
  TaggedIngredient,
} from './types';

type NutrientKey = 'sugarsG' | 'sodiumMg' | 'saturatedFatG';
type LimitId = 'added_sugar' | 'sodium' | 'saturated_fat' | 'caffeine' | 'artificial_sweetener';

interface NutrientEvaluation {
  state: 'high' | 'low' | 'unknown';
  detail: string;
  evidence?: Evidence;
}

interface AllergenHit {
  presence: 'detected' | 'may_contain' | 'inferred';
  label: string;
  source: string;
  evidence: Evidence;
}

const LIMIT_ALIASES: Record<string, LimitId> = {
  'added sugar': 'added_sugar',
  sugar: 'added_sugar',
  'low sugar': 'added_sugar',
  sodium: 'sodium',
  salt: 'sodium',
  'low sodium': 'sodium',
  'saturated fat': 'saturated_fat',
  caffeine: 'caffeine',
  'artificial sweetener': 'artificial_sweetener',
  'artificial sweeteners': 'artificial_sweetener',
};

/**
 * Deterministic profile match. This function does not call a model and does not
 * decide that a food is medically safe. Status comes only from the findings below.
 */
export function analyzeProfile(input: RulesInput): RulesResult {
  const packs = resolvePacks(input.countryCodes);
  const findings: RuleFinding[] = [];
  const clearChecks: string[] = [];
  const limitations: string[] = [
    'Screening uses only the ingredient text, allergen declarations, and nutrition numbers stored for this product.',
  ];

  if (packs.some((pack) => pack.code === 'INTL')) {
    limitations.push('No supported country pack matched this product, so country-specific labeling rules were not applied.');
  }
  if (input.sourceReliability === 'label_photo') {
    limitations.push('Ingredient text was read from a photo and can miss or misread words.');
  }

  const canScreenIngredients = input.ingredients.length > 0 || input.declarations.length > 0;
  if (!canScreenIngredients) {
    findings.push(
      makeFinding({
        type: 'DATA_QUALITY',
        title: 'Ingredient list unavailable',
        severity: 'MEDIUM',
        detection: 'missing_data',
        reason:
          'No ingredient list or allergen declaration was available, so allergies, diet, and ingredient limits could not be checked. This result cannot be treated as suitable.',
        evidence: [
          {
            title: 'Missing ingredient data',
            detail: 'Neither an ingredient list nor an allergen declaration was stored for this product.',
          },
        ],
      }),
    );
  } else if (input.sourceReliability === 'label_photo') {
    findings.push(
      makeFinding({
        type: 'DATA_QUALITY',
        title: 'Ingredients were read from a photo',
        severity: 'MEDIUM',
        detection: 'missing_data',
        reason:
          'The ingredient list was read from a photo. Photo reading can miss or misread an allergen, so this result is not marked suitable on its own. Compare every finding with the physical package.',
        evidence: [
          {
            title: 'Label photo',
            detail: 'The ingredient text came from an image rather than a product database record.',
          },
        ],
      }),
    );
  }

  if (input.staleProductData) {
    findings.push(
      makeFinding({
        type: 'DATA_QUALITY',
        title: 'Stored product data could not be refreshed',
        severity: 'MEDIUM',
        detection: 'missing_data',
        reason:
          'A saved product record was used because the product database could not be refreshed. The ingredient list may be older than the package in your hand.',
        evidence: [
          {
            title: 'Stale product cache',
            detail: 'The upstream product record was not updated during this scan.',
          },
        ],
      }),
    );
  }

  if (canScreenIngredients) {
    findings.push(...matchAllergens(input, packs, clearChecks));
    findings.push(...matchDiet(input));
    findings.push(...matchPreferences(input, findings, clearChecks));
    findings.push(...matchCustomLimits(input));
  }

  findings.push(...matchNutrientLimits(input, packs, clearChecks, canScreenIngredients));
  findings.push(...matchAge(input, packs));

  return {
    status: rollupStatus(findings),
    findings: dedupe(findings),
    clearChecks,
    countryPacks: packs.map((pack) => ({ code: pack.code, name: pack.name, authority: pack.authority })),
    limitations,
  };
}

export function rollupStatus(findings: RuleFinding[]): AnalysisStatus {
  if (findings.some((finding) => finding.severity === 'HIGH')) return 'avoid';
  if (findings.some((finding) => finding.severity === 'MEDIUM')) return 'review';
  return 'suitable';
}

function matchAllergens(input: RulesInput, packs: CountryPack[], clearChecks: string[]): RuleFinding[] {
  const findings: RuleFinding[] = [];
  for (const allergy of input.profile.allergies) {
    const ids = resolveAllergyIds(allergy);
    const hits = collectAllergenHits(allergy, ids, input, packs);
    if (hits.length === 0) {
      clearChecks.push(
        `${allergy} was not found in the ingredient list or allergen declarations. That is not a guarantee that ${allergy.toLowerCase()} is absent.`,
      );
      continue;
    }
    const strongest = strongestPresence(hits);
    const ingredient = hits.find((hit) => hit.presence === strongest)?.label ?? hits[0]?.label;
    findings.push(
      makeFinding({
        type: 'ALLERGEN',
        title: allergenTitle(allergy, strongest),
        ingredient,
        severity: strongest === 'detected' ? 'HIGH' : 'MEDIUM',
        detection: strongest,
        reason: allergenReason(allergy, strongest, hits),
        evidence: hits.map((hit) => hit.evidence),
      }),
    );
  }
  return findings;
}

function collectAllergenHits(
  allergy: string,
  ids: string[],
  input: RulesInput,
  packs: CountryPack[],
): AllergenHit[] {
  const hits: AllergenHit[] = [];

  if (ids.length === 0) {
    for (const ingredient of input.ingredients) {
      if (!textIncludesTerm(ingredient.name, allergy)) continue;
      hits.push({
        presence: 'detected',
        label: ingredient.name,
        source: 'ingredient list',
        evidence: {
          title: `Ingredient list includes “${ingredient.raw}”`,
          detail: `The profile allergy “${allergy}” was matched as written against this ingredient. It is not mapped to a built-in allergen synonym.`,
        },
      });
    }
    return hits;
  }

  for (const ingredient of input.ingredients) {
    for (const tag of ingredient.tags) {
      if (tag.kind !== 'allergen' || !ids.includes(tag.id)) continue;
      hits.push({
        presence: tag.detection === 'inferred' ? 'inferred' : 'detected',
        label: ingredient.name,
        source: 'ingredient list',
        evidence: {
          title: `Ingredient “${ingredient.raw}” matched “${tag.term}”`,
          detail: `${tag.term} maps to ${ALLERGEN_LABELS[tag.id] ?? tag.id}. ${
            tag.detection === 'inferred'
              ? 'The match is inferred from the wording, not from an explicit allergen name.'
              : 'The match is a listed ingredient, not a medical test.'
          }`,
          source: regulationNote(ids, packs),
        },
      });
    }

    const extension = countryExtensionHit(ingredient.name, ids, packs);
    if (extension) {
      hits.push({
        presence: 'detected',
        label: ingredient.name,
        source: extension.pack.authority,
        evidence: {
          title: `${extension.pack.name} allergen extension: ${extension.term}`,
          detail: `${extension.pack.authority} treats ${extension.term} as ${ALLERGEN_LABELS[extension.allergenId] ?? extension.allergenId}. This product’s country data includes ${extension.pack.name}, so the profile allergy is matched on that rule.`,
          source: extension.pack.authority,
          url: extension.pack.sourceUrl,
        },
      });
    } else if (packs.every((pack) => pack.code === 'INTL')) {
      const uncertain = uncertainExtension(ingredient.name, ids);
      if (uncertain) {
        hits.push({
          presence: 'inferred',
          label: ingredient.name,
          source: 'country difference',
          evidence: {
            title: `${uncertain.term} is classified differently by country`,
            detail: `${uncertain.term} is listed, and this product has no supported country. ${uncertain.countries.join('; ')} ${
              uncertain.countries.length === 1 ? 'treats' : 'include rules that treat'
            } it as ${allergy.toLowerCase()}, while other configured countries do not. It is flagged for review rather than as a confirmed allergen match.`,
          },
        });
      }
    }
  }

  for (const declaration of input.declarations) {
    if (!ids.includes(declaration.allergenId)) continue;
    hits.push({
      presence: declaration.presence === 'may_contain' ? 'may_contain' : 'detected',
      label: declaration.label,
      source: declaration.source,
      evidence: {
        title:
          declaration.presence === 'may_contain'
            ? `May contain ${declaration.label}`
            : `Allergen declaration: ${declaration.label}`,
        detail:
          declaration.presence === 'may_contain'
            ? `${declaration.source} lists ${declaration.label} as a possible trace, not as a confirmed ingredient.`
            : `${declaration.source} declares ${declaration.label}.`,
        source: declaration.source,
      },
    });
  }

  return dedupeHits(hits);
}

function matchDiet(input: RulesInput): RuleFinding[] {
  if (input.profile.diet === 'none') return [];
  const blocked =
    input.profile.diet === 'vegan'
      ? ['meat', 'fish', 'shellfish', 'gelatin', 'dairy', 'egg', 'honey', 'carmine']
      : ['meat', 'fish', 'shellfish', 'gelatin'];
  const findings: RuleFinding[] = [];
  for (const flag of blocked) {
    const matches = ingredientsWithFlag(input.ingredients, flag);
    if (matches.length === 0) continue;
    const names = matches.map((item) => item.name);
    findings.push(
      makeFinding({
        type: 'DIET',
        title: `${labelFlag(flag)} does not match a ${input.profile.diet} preference`,
        ingredient: names[0],
        severity: 'HIGH',
        detection: 'detected',
        reason: `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} listed and ${names.length === 1 ? 'is' : 'are'} treated as ${labelFlag(flag)}. This profile is ${input.profile.diet}. This is an ingredient-list check, not a ${input.profile.diet} certification.`,
        evidence: matches.map((item) => ({
          title: `Ingredient “${item.raw}”`,
          detail: `Matched “${flagTerm(item, flag)}” as ${labelFlag(flag)}.`,
        })),
      }),
    );
  }
  return findings;
}

function matchPreferences(input: RulesInput, existing: RuleFinding[], clearChecks: string[]): RuleFinding[] {
  const preferences = input.profile.dietaryPreferences.map(canon);
  const findings: RuleFinding[] = [];

  if (preferences.includes('gluten free')) {
    findings.push(...glutenFindings(input));
  }
  if (preferences.includes('nut free')) {
    findings.push(...nutFreeFindings(input, existing));
  }
  if (preferences.includes('halal')) {
    findings.push(...halalFindings(input, clearChecks));
  }
  if (preferences.includes('kosher')) {
    findings.push(...kosherFindings(input, clearChecks));
  }
  if (preferences.includes('organic preferred')) {
    if (input.organicClaim === true) {
      clearChecks.push('The product data includes an organic claim. That claim was not independently certified by FoodLens.');
    } else {
      findings.push(
        makeFinding({
          type: 'PREFERENCE',
          title: 'No organic claim in the product data',
          severity: 'INFO',
          detection: 'missing_data',
          reason:
            'This profile prefers organic foods. No organic claim was found in the stored product data. That does not establish whether the package is organic.',
          evidence: [
            {
              title: 'Organic claim not found',
              detail: 'FoodLens only reports an organic claim when the product source provides one.',
            },
          ],
        }),
      );
    }
  }

  return findings;
}

function matchCustomLimits(input: RulesInput): RuleFinding[] {
  const findings: RuleFinding[] = [];
  for (const limit of input.profile.limits) {
    if (LIMIT_ALIASES[canon(limit)]) continue;
    const matches = input.ingredients.filter((ingredient) => textIncludesTerm(ingredient.name, limit));
    if (matches.length === 0) continue;
    findings.push(
      makeFinding({
        type: 'LIMIT',
        title: `${limit} is listed in the ingredients`,
        ingredient: matches[0]?.name,
        severity: 'MEDIUM',
        detection: 'detected',
        reason: `This profile limits ${limit}. The ingredient list includes ${matches.map((item) => item.name).join(', ')}.`,
        evidence: matches.map((item) => ({
          title: `Ingredient “${item.raw}”`,
          detail: `The words “${limit}” appear in this ingredient.`,
        })),
      }),
    );
  }
  return findings;
}

function matchNutrientLimits(
  input: RulesInput,
  packs: CountryPack[],
  clearChecks: string[],
  canScreenIngredients: boolean,
): RuleFinding[] {
  const limits = activeLimits(input.profile);
  const findings: RuleFinding[] = [];
  const stage = lifeStage(input.profile);

  if (limits.has('added_sugar')) {
    const sugarIngredients = ingredientsWithFlag(input.ingredients, 'added_sugar');
    const sugars = evaluateNutrient(input.nutrition, packs, 'sugarsG', 'Total sugars');
    if (sugarIngredients.length > 0 || sugars.state === 'high') {
      const underTwo = stage === 'infant' || stage === 'under_two';
      findings.push(
        makeFinding({
          type: 'ADDED_SUGAR',
          title: 'Added sugar signal for this profile',
          ingredient: sugarIngredients[0]?.name ?? 'sugars',
          severity: underTwo ? 'HIGH' : 'MEDIUM',
          detection: sugarIngredients.length > 0 ? 'detected' : 'nutrition_label',
          reason: addedSugarReason(sugarIngredients, sugars, underTwo),
          evidence: [
            ...sugarIngredients.map((item) => ({
              title: `Ingredient “${item.raw}”`,
              detail: `Matched “${flagTerm(item, 'added_sugar')}”, which is treated as an added sugar for this screen.`,
            })),
            ...(sugars.evidence ? [sugars.evidence] : []),
          ],
        }),
      );
    } else if (canScreenIngredients) {
      clearChecks.push(
        sugars.state === 'low'
          ? `No added-sugar ingredients were found. ${sugars.detail}`
          : 'No added-sugar ingredients were found in the ingredient list. A total-sugars number was not available, which is not a guarantee the product is free of added sugar.',
      );
    }
  }

  if (limits.has('sodium')) {
    findings.push(...thresholdLimitFinding({
      type: 'SODIUM',
      title: 'Sodium is above the screening threshold',
      nutrient: 'sodiumMg',
      label: 'Sodium',
      missingTitle: 'Sodium amount unavailable',
      missingReason:
        'This profile limits sodium, but the stored nutrition data has no sodium amount, so sodium could not be compared with a threshold.',
      input,
      packs,
      clearChecks,
      ingredientFallback: ingredientsWithFlag(input.ingredients, 'salt'),
      ingredientReason:
        'This profile limits sodium. Salt is listed, and no sodium amount was available to compare with a numeric threshold.',
    }));
  }

  if (limits.has('saturated_fat')) {
    findings.push(...thresholdLimitFinding({
      type: 'SATURATED_FAT',
      title: 'Saturated fat is above the screening threshold',
      nutrient: 'saturatedFatG',
      label: 'Saturated fat',
      missingTitle: 'Saturated fat amount unavailable',
      missingReason:
        'This profile limits saturated fat, but the stored nutrition data has no saturated fat amount, so it could not be compared with a threshold.',
      input,
      packs,
      clearChecks,
    }));
  }

  if (limits.has('caffeine')) {
    const caffeineMode = stage === 'infant' || stage === 'under_two' ? 'baby' : stage === 'child' ? 'child' : 'limit';
    findings.push(...caffeineFindings(input, clearChecks, canScreenIngredients, caffeineMode, true));
  }

  if (limits.has('artificial_sweetener')) {
    const matches = ingredientsWithFlag(input.ingredients, 'artificial_sweetener');
    if (matches.length > 0) {
      findings.push(
        makeFinding({
          type: 'ARTIFICIAL_SWEETENER',
          title: 'Artificial sweetener listed',
          ingredient: matches[0]?.name,
          severity: 'MEDIUM',
          detection: 'detected',
          reason: `This profile limits artificial sweeteners. The ingredient list includes ${matches
            .map((item) => flagTerm(item, 'artificial_sweetener'))
            .join(', ')}.`,
          evidence: matches.map((item) => ({
            title: `Ingredient “${item.raw}”`,
            detail: `Matched “${flagTerm(item, 'artificial_sweetener')}”.`,
          })),
        }),
      );
    } else if (canScreenIngredients) {
      clearChecks.push(
        'No configured artificial sweeteners were found in the ingredient list. That is not a guarantee none are present.',
      );
    }
  }

  return findings;
}

function matchAge(input: RulesInput, packs: CountryPack[]): RuleFinding[] {
  const stage = lifeStage(input.profile);
  if (stage === 'other') return [];
  const findings: RuleFinding[] = [];
  const babyLike = stage === 'infant' || stage === 'under_two';

  if (babyLike) {
    const honey = ingredientsWithFlag(input.ingredients, 'honey');
    if (honey.length > 0 && (stage === 'infant' || input.profile.ageGroup === 'baby' || (input.profile.age !== null && input.profile.age < 1))) {
      findings.push(
        makeFinding({
          type: 'AGE',
          title: 'Honey is listed for an infant profile',
          ingredient: honey[0]?.name,
          severity: 'HIGH',
          detection: 'detected',
          reason:
            'Honey is listed, and this profile is in the baby age group or under 1 year. Public health guidance says honey should not be given to infants under 12 months because of the risk of infant botulism. This is not a diagnosis.',
          evidence: [
            {
              title: `Ingredient “${honey[0]?.raw ?? 'honey'}”`,
              detail: 'Honey was matched in the ingredient list.',
              source: 'U.S. CDC',
              url: 'https://www.cdc.gov/botulism/prevention/index.html',
            },
          ],
        }),
      );
    }

    const sugars = ingredientsWithFlag(input.ingredients, 'added_sugar').filter((item) => !item.tags.some((tag) => tag.id === 'honey'));
    if (sugars.length > 0) {
      findings.push(
        makeFinding({
          type: 'AGE',
          title: 'Added sugar is listed for a young child profile',
          ingredient: sugars[0]?.name,
          severity: 'HIGH',
          detection: 'detected',
          reason: `Added sugar is listed (${sugars.map((item) => flagTerm(item, 'added_sugar')).join(', ')}), and this profile is under 2 years or in the baby age group. The Dietary Guidelines for Americans recommend avoiding added sugars before age 2. That is general public guidance, not a diagnosis.`,
          evidence: [
            {
              title: 'Added sugar and early childhood',
              detail: 'Applied because the profile age group is baby or the numeric age is under 2.',
              source: 'Dietary Guidelines for Americans',
              url: 'https://www.dietaryguidelines.gov/',
            },
          ],
        }),
      );
    }

    const salt = ingredientsWithFlag(input.ingredients, 'salt');
    const sodium = evaluateNutrient(input.nutrition, packs, 'sodiumMg', 'Sodium');
    if (salt.length > 0 || sodium.state === 'high') {
      findings.push(
        makeFinding({
          type: 'AGE',
          title: 'Salt or sodium for a baby profile',
          ingredient: salt[0]?.name ?? 'sodium',
          severity: 'MEDIUM',
          detection: sodium.state === 'high' && salt.length === 0 ? 'nutrition_label' : 'detected',
          reason:
            'This profile is in the baby age group or under 2 years, and salt or a high sodium amount was found. That is a screening finding from the ingredient list or nutrition numbers, not a medical assessment.',
          evidence: [
            ...salt.map((item) => ({ title: `Ingredient “${item.raw}”`, detail: 'Salt was listed.' })),
            ...(sodium.evidence ? [sodium.evidence] : []),
          ],
        }),
      );
    }
  }

  const caffeineMode = babyLike ? 'baby' : 'child';
  findings.push(...caffeineFindings(input, [], true, caffeineMode, false));
  return findings;
}

function caffeineFindings(
  input: RulesInput,
  clearChecks: string[],
  canScreen: boolean,
  mode: 'baby' | 'child' | 'limit',
  recordAbsence: boolean,
): RuleFinding[] {
  const strong = ingredientsWithFlag(input.ingredients, 'caffeine_strong');
  const mild = ingredientsWithFlag(input.ingredients, 'caffeine_mild');
  if (strong.length === 0 && mild.length === 0) {
    if (canScreen && recordAbsence) {
      clearChecks.push('No caffeine ingredients in the configured list were found. That is not a guarantee the product is caffeine-free.');
    }
    return [];
  }

  const baby = mode === 'baby';
  const severity: Severity = baby && strong.length > 0 ? 'HIGH' : 'MEDIUM';
  const names = [...strong, ...mild].map((item) => item.name);
  return [
    makeFinding({
      type: 'CAFFEINE',
      title: 'Caffeine ingredient listed',
      ingredient: names[0],
      severity,
      detection: strong.length > 0 ? 'detected' : 'inferred',
      reason: caffeineReason(mode, strong, mild),
      evidence: [...strong, ...mild].map((item) => ({
        title: `Ingredient “${item.raw}”`,
        detail: `Matched “${item.tags.find((tag) => tag.id === 'caffeine_strong' || tag.id === 'caffeine_mild')?.term ?? item.name}”.`,
      })),
    }),
  ];
}

function thresholdLimitFinding(options: {
  type: 'SODIUM' | 'SATURATED_FAT';
  title: string;
  nutrient: NutrientKey;
  label: string;
  missingTitle: string;
  missingReason: string;
  input: RulesInput;
  packs: CountryPack[];
  clearChecks: string[];
  ingredientFallback?: TaggedIngredient[];
  ingredientReason?: string;
}): RuleFinding[] {
  const evaluation = evaluateNutrient(options.input.nutrition, options.packs, options.nutrient, options.label);
  if (evaluation.state === 'high' && evaluation.evidence) {
    return [
      makeFinding({
        type: options.type,
        title: options.title,
        ingredient: options.label.toLowerCase(),
        severity: 'MEDIUM',
        detection: 'nutrition_label',
        reason: `${options.label} is above the screening threshold used for this product. ${evaluation.detail} This is a label comparison, not a medical assessment.`,
        evidence: [evaluation.evidence],
      }),
    ];
  }
  if (evaluation.state === 'low') {
    options.clearChecks.push(evaluation.detail);
    return [];
  }
  if (options.ingredientFallback && options.ingredientFallback.length > 0 && options.ingredientReason) {
    return [
      makeFinding({
        type: options.type,
        title: `${options.label} could not be measured`,
        ingredient: options.ingredientFallback[0]?.name,
        severity: 'MEDIUM',
        detection: 'inferred',
        reason: options.ingredientReason,
        evidence: options.ingredientFallback.map((item) => ({
          title: `Ingredient “${item.raw}”`,
          detail: 'Used because a numeric amount was not available.',
        })),
      }),
    ];
  }
  return [
    makeFinding({
      type: 'DATA_QUALITY',
      title: options.missingTitle,
      severity: 'MEDIUM',
      detection: 'missing_data',
      reason: options.missingReason,
      evidence: [
        {
          title: `${options.label} not reported`,
          detail: evaluation.detail,
        },
      ],
    }),
  ];
}

function evaluateNutrient(
  nutrition: NutritionFacts | null,
  packs: CountryPack[],
  nutrient: NutrientKey,
  label: string,
): NutrientEvaluation {
  const direct = compareNutrient(nutrition, packs.filter((pack) => pack.code !== 'INTL'), nutrient, label, false);
  if (direct) return direct;
  const fallback = compareNutrient(nutrition, [INTERNATIONAL_PACK], nutrient, label, true);
  if (fallback) return fallback;
  return {
    state: 'unknown',
    detail: `${label} was not reported on a per-serving or per-100 g basis that a configured threshold can use.`,
  };
}

function compareNutrient(
  nutrition: NutritionFacts | null,
  packs: CountryPack[],
  nutrient: NutrientKey,
  label: string,
  usedFallback: boolean,
): NutrientEvaluation | null {
  if (!nutrition || packs.length === 0) return null;
  const candidates = packs.flatMap((pack) => readingsFor(nutrition, pack, nutrient));
  if (candidates.length === 0) return null;
  const highCandidate = candidates.find((candidate) => candidate.value > candidate.threshold);
  const chosen = highCandidate ?? candidates[0];
  if (!chosen) return null;
  const basisLabel = chosen.basis === 'per_serving' ? 'per serving' : 'per 100 g';
  const isHigh = chosen.value > chosen.threshold;
  const caveat =
    nutrient === 'sugarsG'
      ? ' The number is total sugars, which can include naturally occurring sugars, not a separate added-sugar measurement.'
      : '';
  const fallbackNote = usedFallback
    ? ' A country-specific numeric threshold could not be applied to the available basis, so the international per-100 g screen was used.'
    : '';
  const detail = `${label} is ${formatAmount(chosen.value, chosen.unit)} ${basisLabel}, which is ${isHigh ? 'above' : 'not above'} the ${formatAmount(chosen.threshold, chosen.unit)} ${basisLabel} screening threshold (${chosen.thresholdName}).${caveat}${fallbackNote}`;
  return {
    state: isHigh ? 'high' : 'low',
    detail,
    evidence: {
      title: `${label} ${basisLabel}`,
      detail,
      source: chosen.thresholdName,
      url: chosen.sourceUrl,
    },
  };
}

function readingsFor(nutrition: NutritionFacts, pack: CountryPack, nutrient: NutrientKey) {
  const nutritionConfig = pack.nutrition;
  if (!nutritionConfig) return [];
  const rows: Array<{ basis: 'per_serving' | 'per_100g'; value: number | undefined; threshold: number | undefined; unit: string }> = [
    {
      basis: 'per_serving',
      value: nutrition.perServing?.[nutrient],
      threshold:
        nutrient === 'sugarsG'
          ? nutritionConfig.sugarsPerServingHigh
          : nutrient === 'sodiumMg'
            ? nutritionConfig.sodiumMgPerServingHigh
            : nutritionConfig.saturatedFatPerServingHigh,
      unit: nutrient === 'sodiumMg' ? 'mg' : 'g',
    },
    {
      basis: 'per_100g',
      value: nutrition.per100g?.[nutrient],
      threshold:
        nutrient === 'sugarsG'
          ? nutritionConfig.sugarsPer100gHigh
          : nutrient === 'sodiumMg'
            ? nutritionConfig.sodiumMgPer100gHigh
            : nutritionConfig.saturatedFatPer100gHigh,
      unit: nutrient === 'sodiumMg' ? 'mg' : 'g',
    },
  ];
  return rows
    .filter((row) => row.value !== undefined && row.threshold !== undefined)
    .map((row) => ({
      basis: row.basis,
      value: row.value as number,
      threshold: row.threshold as number,
      unit: row.unit,
      thresholdName: nutritionConfig.name,
      sourceUrl: nutritionConfig.sourceUrl,
    }));
}

function glutenFindings(input: RulesInput): RuleFinding[] {
  const matches = input.ingredients.filter((ingredient) =>
    ingredient.tags.some((tag) => tag.id === 'gluten' || tag.id === 'wheat'),
  );
  if (matches.length === 0) return [];
  const inferredOnly = matches.every((ingredient) =>
    ingredient.tags.filter((tag) => tag.id === 'gluten' || tag.id === 'wheat').every((tag) => tag.detection === 'inferred'),
  );
  return [
    makeFinding({
      type: 'PREFERENCE',
      title: inferredOnly ? 'Possible gluten source' : 'Gluten source listed',
      ingredient: matches[0]?.name,
      severity: inferredOnly ? 'MEDIUM' : 'HIGH',
      detection: inferredOnly ? 'inferred' : 'detected',
      reason: inferredOnly
        ? `This profile prefers gluten-free foods. ${matches.map((item) => item.name).join(', ')} can be a gluten source, but the wording does not confirm a gluten-containing grain. This is not a celiac diagnosis or a gluten-free certification.`
        : `This profile prefers gluten-free foods. ${matches.map((item) => item.name).join(', ')} is listed as a gluten source. This is not a celiac diagnosis or a gluten-free certification.`,
      evidence: matches.map((item) => ({
        title: `Ingredient “${item.raw}”`,
        detail: `Matched “${item.tags.find((tag) => tag.id === 'gluten' || tag.id === 'wheat')?.term ?? item.name}”.`,
      })),
    }),
  ];
}

function nutFreeFindings(input: RulesInput, existing: RuleFinding[]): RuleFinding[] {
  const ids = ['peanut', 'tree_nut'];
  const matches = input.ingredients.filter((ingredient) =>
    ingredient.tags.some((tag) => tag.kind === 'allergen' && ids.includes(tag.id)),
  );
  const uncovered = matches.filter((ingredient) => !existing.some((finding) => finding.type === 'ALLERGEN' && finding.ingredient === ingredient.name));
  if (uncovered.length === 0) return [];
  return [
    makeFinding({
      type: 'PREFERENCE',
      title: 'Nut ingredient listed',
      ingredient: uncovered[0]?.name,
      severity: 'HIGH',
      detection: 'detected',
      reason: `This profile prefers nut-free foods. ${uncovered.map((item) => item.name).join(', ')} is listed. This is a preference match, not an allergy diagnosis or a nut-free certification.`,
      evidence: uncovered.map((item) => ({
        title: `Ingredient “${item.raw}”`,
        detail: 'Matched a peanut or tree-nut term.',
      })),
    }),
  ];
}

function halalFindings(input: RulesInput, clearChecks: string[]): RuleFinding[] {
  const pork = ingredientsWithFlag(input.ingredients, 'pork');
  const alcohol = ingredientsWithFlag(input.ingredients, 'alcohol');
  const gelatin = ingredientsWithFlag(input.ingredients, 'gelatin');
  const possibleAlcohol = ingredientsWithFlag(input.ingredients, 'alcohol_possible');
  const findings: RuleFinding[] = [];
  if (pork.length > 0) {
    findings.push(religiousFinding('halal', 'Pork is listed', pork, 'HIGH', 'detected', 'Pork is listed. A product listing pork is not halal. FoodLens is not a halal certifier and did not assess slaughter method or cross-contact.'));
  }
  if (alcohol.length > 0) {
    findings.push(religiousFinding('halal', 'Alcohol is listed', alcohol, 'HIGH', 'detected', 'Alcohol is listed. FoodLens is not a halal certifier and did not assess whether the amount would be excluded under a particular standard.'));
  }
  if (gelatin.length > 0) {
    findings.push(religiousFinding('halal', 'Gelatin source is not identified', gelatin, 'MEDIUM', 'inferred', 'Gelatin is listed and the source species is not identified, so it is not treated as halal. This is not a halal certification.'));
  }
  if (possibleAlcohol.length > 0) {
    findings.push(religiousFinding('halal', 'An ingredient may contain alcohol', possibleAlcohol, 'MEDIUM', 'inferred', 'An ingredient that can contain alcohol is listed. The alcohol content was not measured. This is not a halal certification.'));
  }
  if (findings.length === 0) {
    clearChecks.push('No pork, alcohol, or gelatin was found in the ingredient list. This is not a halal certification.');
  }
  return findings;
}

function kosherFindings(input: RulesInput, clearChecks: string[]): RuleFinding[] {
  const pork = ingredientsWithFlag(input.ingredients, 'pork');
  const shellfish = ingredientsWithFlag(input.ingredients, 'shellfish');
  const gelatin = ingredientsWithFlag(input.ingredients, 'gelatin');
  const meat = ingredientsWithFlag(input.ingredients, 'meat');
  const dairy = ingredientsWithFlag(input.ingredients, 'dairy');
  const findings: RuleFinding[] = [];
  if (pork.length > 0) {
    findings.push(religiousFinding('kosher', 'Pork is listed', pork, 'HIGH', 'detected', 'Pork is listed. Pork is not kosher. FoodLens is not a kosher certifier and did not assess supervision or equipment.'));
  }
  if (shellfish.length > 0) {
    findings.push(religiousFinding('kosher', 'Shellfish is listed', shellfish, 'HIGH', 'detected', 'Shellfish is listed. Shellfish is not kosher. FoodLens is not a kosher certifier.'));
  }
  if (gelatin.length > 0) {
    findings.push(religiousFinding('kosher', 'Gelatin source is not identified', gelatin, 'MEDIUM', 'inferred', 'Gelatin is listed and the source species is not identified. This is not a kosher certification.'));
  }
  if (meat.length > 0 && dairy.length > 0) {
    findings.push(
      makeFinding({
        type: 'PREFERENCE',
        title: 'Meat and dairy are both listed',
        ingredient: meat[0]?.name,
        severity: 'MEDIUM',
        detection: 'inferred',
        reason: 'Both a meat ingredient and a dairy ingredient are listed. That combination is not kosher. This is not a kosher certification and does not assess whether they were processed together.',
        evidence: [...meat, ...dairy].map((item) => ({ title: `Ingredient “${item.raw}”`, detail: 'Used for the meat and dairy check.' })),
      }),
    );
  }
  if (findings.length === 0) {
    clearChecks.push('No pork, shellfish, or unspecified gelatin was found. This is not a kosher certification.');
  }
  return findings;
}

function religiousFinding(
  preference: string,
  title: string,
  ingredients: TaggedIngredient[],
  severity: Severity,
  detection: 'detected' | 'inferred',
  reason: string,
): RuleFinding {
  return makeFinding({
    type: 'PREFERENCE',
    title,
    ingredient: ingredients[0]?.name,
    severity,
    detection,
    reason: `This profile includes a ${preference} preference. ${reason}`,
    evidence: ingredients.map((item) => ({
      title: `Ingredient “${item.raw}”`,
      detail: `Matched for the ${preference} ingredient screen.`,
    })),
  });
}

function countryExtensionHit(name: string, allergenIds: string[], packs: CountryPack[]) {
  for (const pack of packs) {
    if (pack.code === 'INTL') continue;
    for (const allergenId of allergenIds) {
      for (const term of pack.allergenTermExtensions[allergenId] ?? []) {
        if (textIncludesTerm(name, term)) return { pack, term, allergenId };
      }
    }
  }
  return null;
}

function uncertainExtension(name: string, allergenIds: string[]) {
  const countries: string[] = [];
  let term = '';
  for (const pack of Object.values(COUNTRY_PACKS)) {
    for (const allergenId of allergenIds) {
      for (const candidate of pack.allergenTermExtensions[allergenId] ?? []) {
        if (!textIncludesTerm(name, candidate)) continue;
        term = candidate;
        countries.push(`${pack.name} (${pack.authority})`);
      }
    }
  }
  if (!term) return null;
  return { term, countries };
}

function regulationNote(allergenIds: string[], packs: CountryPack[]): string | undefined {
  const matching = packs.filter(
    (pack) => pack.code !== 'INTL' && allergenIds.some((id) => pack.regulatedAllergens.includes(id)),
  );
  if (matching.length === 0) return undefined;
  return `Regulated allergen list applied: ${packsMention(matching)}.`;
}

function activeLimits(profile: ProfileRules): Set<LimitId> {
  const limits = new Set<LimitId>();
  for (const value of [...profile.limits, ...profile.dietaryPreferences]) {
    const mapped = LIMIT_ALIASES[canon(value)];
    if (mapped) limits.add(mapped);
  }
  return limits;
}

function lifeStage(profile: ProfileRules): 'infant' | 'under_two' | 'child' | 'other' {
  if (profile.ageGroup === 'baby' || (profile.age !== null && profile.age < 1)) return 'infant';
  if (profile.age !== null && profile.age < 2) return 'under_two';
  if (profile.ageGroup === 'child' || (profile.age !== null && profile.age < 13)) return 'child';
  return 'other';
}

function ingredientsWithFlag(ingredients: TaggedIngredient[], flag: string): TaggedIngredient[] {
  return ingredients.filter((ingredient) => ingredient.tags.some((tag) => tag.kind === 'flag' && tag.id === flag));
}

function flagTerm(ingredient: TaggedIngredient, flag: string): string {
  return ingredient.tags.find((tag) => tag.id === flag)?.term ?? ingredient.name;
}

function labelFlag(flag: string): string {
  const labels: Record<string, string> = {
    meat: 'meat',
    fish: 'fish',
    shellfish: 'shellfish',
    gelatin: 'gelatin',
    dairy: 'dairy',
    egg: 'egg',
    honey: 'honey',
    carmine: 'carmine',
  };
  return labels[flag] ?? flag;
}

function strongestPresence(hits: AllergenHit[]): 'detected' | 'may_contain' | 'inferred' {
  if (hits.some((hit) => hit.presence === 'detected')) return 'detected';
  if (hits.some((hit) => hit.presence === 'inferred')) return 'inferred';
  return 'may_contain';
}

function allergenTitle(allergy: string, presence: AllergenHit['presence']): string {
  if (presence === 'may_contain') return `${allergy} listed as may contain`;
  if (presence === 'inferred') return `${allergy} inferred from the wording`;
  return `${allergy} listed in the ingredients`;
}

function allergenReason(allergy: string, presence: AllergenHit['presence'], hits: AllergenHit[]): string {
  const labels = uniqueLabels(hits);
  if (presence === 'may_contain') {
    return `This profile lists a ${allergy.toLowerCase()} allergy. The source says it may contain ${labels}. That is a cross-contact warning, not a confirmed ingredient, so it is not marked as detected. It also does not mean the product is free of ${allergy.toLowerCase()}.`;
  }
  if (presence === 'inferred') {
    return `This profile lists a ${allergy.toLowerCase()} allergy. The wording points to ${labels}, but the ingredient name does not explicitly confirm it. Review the package before treating this as a definite match.`;
  }
  return `This profile lists a ${allergy.toLowerCase()} allergy. The available ingredient data lists ${labels}. This is a match against that data, not a medical test.`;
}

function addedSugarReason(ingredients: TaggedIngredient[], sugars: NutrientEvaluation, underTwo: boolean): string {
  const parts: string[] = [];
  if (ingredients.length > 0) {
    parts.push(`Added-sugar ingredients are listed: ${ingredients.map((item) => flagTerm(item, 'added_sugar')).join(', ')}.`);
  }
  if (sugars.state === 'high') parts.push(sugars.detail);
  if (underTwo) {
    parts.push('The profile is under 2 years or in the baby age group, so added sugar is high severity for this screen.');
  } else {
    parts.push('This profile limits added sugar.');
  }
  parts.push('This is not a measurement of how the product will affect a person.');
  return parts.join(' ');
}

function caffeineReason(mode: 'baby' | 'child' | 'limit', strong: TaggedIngredient[], mild: TaggedIngredient[]): string {
  const strongTerms = strong.map((item) => flagTerm(item, 'caffeine_strong'));
  const mildTerms = mild.map((item) => flagTerm(item, 'caffeine_mild'));
  const listed = [...strongTerms, ...mildTerms].join(', ');
  if (mode === 'baby') {
    return `${listed} is listed on a baby profile. Coffee, guarana, and added caffeine are treated as high severity; tea, cocoa, and cola are treated as a review finding because the caffeine amount was not measured.`;
  }
  if (mode === 'child') {
    return `${listed} is listed on a child profile. The caffeine amount was not measured, so this is a review finding rather than a dose assessment.`;
  }
  return `This profile limits caffeine. ${listed} is listed. ${mild.length > 0 && strong.length === 0 ? 'The caffeine amount was not measured.' : 'The ingredient is an explicit caffeine source in the configured list.'}`;
}

function formatAmount(value: number, unit: string): string {
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, '');
  return `${rounded} ${unit}`;
}

function uniqueLabels(hits: AllergenHit[]): string {
  return [...new Set(hits.map((hit) => hit.label))].join(', ');
}

function dedupeHits(hits: AllergenHit[]): AllergenHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.presence}:${canon(hit.label)}:${hit.evidence.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupe(findings: RuleFinding[]): RuleFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.id)) return false;
    seen.add(finding.id);
    return true;
  });
}

function makeFinding(input: {
  type: RuleFinding['type'];
  title: string;
  ingredient?: string;
  severity: Severity;
  detection: RuleFinding['detection'];
  reason: string;
  evidence: Evidence[];
}): RuleFinding {
  const ingredient = input.ingredient ? canon(input.ingredient) : input.title;
  return {
    id: `${input.type}:${ingredient}:${input.detection}`,
    type: input.type,
    title: input.title,
    ingredient: input.ingredient,
    severity: input.severity,
    reason: input.reason,
    detection: input.detection,
    evidence: input.evidence,
  };
}
