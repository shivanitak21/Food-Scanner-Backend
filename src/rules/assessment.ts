import { ALLERGEN_LABELS } from './dictionaries';
import type { HealthCondition } from './context';
import { hasPersonalContext, resolvedAge, type AnalysisContext } from './context';
import type { AllergenDeclaration, NutritionFacts, NutrientAmount, RuleFinding, RulesResult, TaggedIngredient } from './types';

export type NutrientId =
  | 'calories'
  | 'protein'
  | 'carbohydrates'
  | 'sugar'
  | 'fiber'
  | 'sodium'
  | 'saturatedFat'
  | 'transFat'
  | 'fat';

export type NutrientLevel = 'low' | 'moderate' | 'high' | 'unknown';

export type OverallId = 'good' | 'review' | 'limit' | 'insufficient';

type BandMeaning = 'concern' | 'support' | 'neutral';

interface Band {
  lowAtMost: number;
  highAbove: number;
}

interface NutrientRule {
  id: NutrientId;
  name: string;
  shortName: string;
  unit: string;
  field: keyof NutrientAmount;
  meaning: BandMeaning;
  per100g: Band;
  perServing?: Band;
  /** Levels worth a "what to know" line when this nutrient is not emphasized by context. */
  mention: NutrientLevel[];
  core: boolean;
}

/**
 * Screening bands. Per-100 g cut-offs for fat, saturates, sugars, and salt follow
 * UK FSA traffic-light boundaries. Other nutrients use labeled screening bands,
 * not a medical target for a person.
 */
const NUTRIENTS: NutrientRule[] = [
  {
    id: 'calories',
    name: 'Calories',
    shortName: 'calories',
    unit: 'kcal',
    field: 'energyKcal',
    meaning: 'concern',
    per100g: { lowAtMost: 150, highAbove: 400 },
    perServing: { lowAtMost: 150, highAbove: 400 },
    mention: ['high'],
    core: true,
  },
  {
    id: 'protein',
    name: 'Protein',
    shortName: 'protein',
    unit: 'g',
    field: 'proteinG',
    meaning: 'support',
    per100g: { lowAtMost: 5, highAbove: 12 },
    perServing: { lowAtMost: 5, highAbove: 15 },
    mention: ['low', 'moderate', 'high'],
    core: true,
  },
  {
    id: 'carbohydrates',
    name: 'Carbohydrates',
    shortName: 'carbohydrates',
    unit: 'g',
    field: 'carbohydratesG',
    meaning: 'neutral',
    per100g: { lowAtMost: 10, highAbove: 50 },
    perServing: { lowAtMost: 15, highAbove: 45 },
    mention: [],
    core: true,
  },
  {
    id: 'sugar',
    name: 'Sugar',
    shortName: 'sugar',
    unit: 'g',
    field: 'sugarsG',
    meaning: 'concern',
    per100g: { lowAtMost: 5, highAbove: 22.5 },
    perServing: { lowAtMost: 5, highAbove: 27 },
    mention: ['moderate', 'high'],
    core: true,
  },
  {
    id: 'fiber',
    name: 'Fiber',
    shortName: 'fiber',
    unit: 'g',
    field: 'fiberG',
    meaning: 'support',
    per100g: { lowAtMost: 3, highAbove: 6 },
    perServing: { lowAtMost: 2, highAbove: 6 },
    mention: ['low', 'high'],
    core: true,
  },
  {
    id: 'sodium',
    name: 'Sodium',
    shortName: 'sodium',
    unit: 'mg',
    field: 'sodiumMg',
    meaning: 'concern',
    per100g: { lowAtMost: 120, highAbove: 600 },
    perServing: { lowAtMost: 120, highAbove: 720 },
    mention: ['moderate', 'high'],
    core: true,
  },
  {
    id: 'saturatedFat',
    name: 'Saturated fat',
    shortName: 'saturated fat',
    unit: 'g',
    field: 'saturatedFatG',
    meaning: 'concern',
    per100g: { lowAtMost: 1.5, highAbove: 5 },
    perServing: { lowAtMost: 1.5, highAbove: 6 },
    mention: ['moderate', 'high'],
    core: true,
  },
  {
    id: 'transFat',
    name: 'Trans fat',
    shortName: 'trans fat',
    unit: 'g',
    field: 'transFatG',
    meaning: 'concern',
    per100g: { lowAtMost: 0, highAbove: 0 },
    mention: ['high'],
    core: false,
  },
  {
    id: 'fat',
    name: 'Fat',
    shortName: 'fat',
    unit: 'g',
    field: 'fatG',
    meaning: 'concern',
    per100g: { lowAtMost: 3, highAbove: 17.5 },
    perServing: { lowAtMost: 3, highAbove: 21 },
    mention: ['high'],
    core: false,
  },
];

const LEVEL_LABEL: Record<NutrientLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  unknown: 'Not reported',
};

const OVERALL_LABEL: Record<OverallId, string> = {
  good: 'Good choice',
  review: 'Review',
  limit: 'Limit',
  insufficient: 'Not enough information',
};

const OVERALL_DETAIL: Record<OverallId, string> = {
  good: 'Nothing in the available nutrition numbers is above the screening thresholds.',
  review: 'One part of this product is worth a closer look.',
  limit: 'More than one nutrient is above a screening threshold, or a detail you added conflicts with the ingredients.',
  insufficient: 'The package did not include enough nutrition or ingredient information for a full check.',
};

const CONTEXT_LIMIT_DETAIL = 'This conflicts with details you added. It is not a medical diagnosis.';

interface HealthRule {
  nutrients: NutrientId[];
  note: string;
}

const HEALTH_RULES: Record<HealthCondition, HealthRule> = {
  diabetes: {
    nutrients: ['carbohydrates', 'sugar'],
    note: "Relevant if you're watching blood sugar.",
  },
  high_blood_pressure: {
    nutrients: ['sodium'],
    note: "Relevant if you're monitoring sodium.",
  },
  high_cholesterol: {
    nutrients: ['saturatedFat', 'transFat', 'fat'],
    note: "Relevant if you're watching saturated fat.",
  },
  other: {
    nutrients: [],
    note: 'Consider discussing dietary changes with a healthcare professional.',
  },
};

const WATCH_NUTRIENTS: Record<string, NutrientId[]> = {
  sugar: ['sugar'],
  sodium: ['sodium'],
  saturated_fat: ['saturatedFat'],
  calories: ['calories'],
  protein: ['protein'],
  fiber: ['fiber'],
};

const GOAL_NUTRIENTS: Record<string, NutrientId[]> = {
  balanced: ['protein', 'fiber', 'sugar', 'sodium', 'saturatedFat'],
  more_protein: ['protein'],
  lower_sugar: ['sugar'],
  lower_sodium: ['sodium'],
};

interface AgeEmphasisRule {
  minAge: number;
  maxAge: number;
  nutrients: NutrientId[];
}

const AGE_EMPHASIS: AgeEmphasisRule[] = [
  { minAge: 0, maxAge: 2, nutrients: ['sugar', 'sodium', 'calories'] },
  { minAge: 3, maxAge: 12, nutrients: ['sugar', 'fiber', 'protein', 'calories'] },
  { minAge: 13, maxAge: 17, nutrients: ['protein', 'fiber', 'sugar', 'calories'] },
  { minAge: 18, maxAge: 59, nutrients: ['protein', 'fiber', 'saturatedFat', 'sodium'] },
  { minAge: 60, maxAge: 120, nutrients: ['protein', 'fiber', 'sodium', 'saturatedFat'] },
];

const PROFESSIONAL_NOTE = 'Consider discussing dietary changes with a healthcare professional.';

const AUDIENCE_EMPTY = 'No specific groups stood out from this product’s ingredient list or nutrition numbers.';

interface AudienceRule {
  id: string;
  text: string;
  nutrient?: NutrientId;
  levels?: NutrientLevel[];
  flags?: string[];
  allergens?: string[];
}

const AUDIENCE_RULES: AudienceRule[] = [
  { id: 'sodium', text: 'People watching sodium', nutrient: 'sodium', levels: ['high'], flags: ['salt'] },
  { id: 'sugar', text: 'People monitoring added sugar', nutrient: 'sugar', levels: ['high'], flags: ['added_sugar'] },
  { id: 'saturated-fat', text: 'People watching saturated fat', nutrient: 'saturatedFat', levels: ['high'] },
  { id: 'dairy', text: 'People avoiding dairy', flags: ['dairy'], allergens: ['milk'] },
  { id: 'gluten', text: 'People avoiding gluten', flags: ['gluten'], allergens: ['wheat', 'gluten'] },
  { id: 'egg', text: 'People avoiding egg', flags: ['egg'], allergens: ['egg'] },
  { id: 'peanut', text: 'People avoiding peanuts', allergens: ['peanut'] },
  { id: 'tree-nut', text: 'People avoiding tree nuts', allergens: ['tree_nut'] },
  { id: 'soy', text: 'People avoiding soy', allergens: ['soy'] },
  { id: 'fish', text: 'People avoiding fish', flags: ['fish'], allergens: ['fish'] },
  { id: 'shellfish', text: 'People avoiding shellfish', flags: ['shellfish'], allergens: ['crustacean_shellfish', 'mollusc'] },
  { id: 'caffeine', text: 'People avoiding caffeine', flags: ['caffeine_strong', 'caffeine_mild'] },
  { id: 'sweetener', text: 'People avoiding artificial sweeteners', flags: ['artificial_sweetener'] },
];

const NOTABLE_TAGS: Array<{ kind: 'flag' | 'allergen'; id: string; note: string }> = [
  { kind: 'flag', id: 'added_sugar', note: 'Added sugar' },
  { kind: 'flag', id: 'caffeine_strong', note: 'Caffeine' },
  { kind: 'flag', id: 'caffeine_mild', note: 'Caffeine' },
  { kind: 'flag', id: 'artificial_sweetener', note: 'Artificial sweetener' },
  { kind: 'flag', id: 'salt', note: 'Salt' },
  { kind: 'allergen', id: 'milk', note: 'Dairy' },
  { kind: 'allergen', id: 'egg', note: 'Egg' },
  { kind: 'allergen', id: 'peanut', note: 'Peanut' },
  { kind: 'allergen', id: 'tree_nut', note: 'Tree nut' },
  { kind: 'allergen', id: 'wheat', note: 'Wheat' },
  { kind: 'allergen', id: 'gluten', note: 'Gluten' },
  { kind: 'allergen', id: 'soy', note: 'Soy' },
  { kind: 'allergen', id: 'fish', note: 'Fish' },
  { kind: 'allergen', id: 'crustacean_shellfish', note: 'Shellfish' },
  { kind: 'allergen', id: 'sesame', note: 'Sesame' },
];

const CAUTION_DETAIL: Partial<Record<RuleFinding['type'], string>> = {
  ALLERGEN: 'Relevant if you are avoiding this ingredient. This is a match against the ingredient list, not a medical test.',
  DIET: 'This does not match the diet you selected. This is an ingredient-list check, not a certification.',
  PREFERENCE: 'This does not match a dietary preference you selected.',
  AGE: 'Relevant for the age you entered. This is general public guidance, not a diagnosis.',
  CAFFEINE: 'A caffeine ingredient is listed. The amount was not measured.',
  LIMIT: 'This matches something you asked to watch.',
};

const CAUTION_TYPES = new Set<RuleFinding['type']>(['ALLERGEN', 'DIET', 'PREFERENCE', 'AGE', 'CAFFEINE', 'LIMIT']);

export interface NutritionHighlight {
  id: NutrientId;
  name: string;
  amount: string | null;
  unit: string;
  basis: string | null;
  level: NutrientLevel;
  levelLabel: string;
  bar: number;
  tone: 'positive' | 'attention' | 'concern' | 'neutral';
  emphasized: boolean;
}

export interface QuickCaution {
  id: string;
  title: string;
  detail: string;
}

export interface ProductAssessment {
  overall: OverallId;
  overallLabel: string;
  overallDetail: string;
  highlights: NutritionHighlight[];
  whatToKnow: string[];
  notableIngredients: Array<{ name: string; note: string }>;
  whoMayWantToCheck: string[];
  whoEmpty: string;
  contextNotes: string[];
  professionalNote: string | null;
  cautions: QuickCaution[];
  emphasized: NutrientId[];
}

export function assessProduct(input: {
  ingredients: TaggedIngredient[];
  declarations: AllergenDeclaration[];
  nutrition: NutritionFacts | null;
  rules: RulesResult;
  context: AnalysisContext;
}): ProductAssessment {
  const emphasized = emphasisFor(input.context);
  const readings = NUTRIENTS.map((rule) => scoreNutrient(rule, input.nutrition, emphasized.has(rule.id)));
  const byId = new Map(readings.map((item) => [item.id, item]));
  const hasNutrition = readings.some((item) => item.level !== 'unknown');
  const hasIngredients = input.ingredients.length > 0 || input.declarations.length > 0;
  const concernHigh = readings.filter((item) => item.meaning === 'concern' && item.level === 'high');
  const contextConflict = input.rules.findings.some(
    (finding) => finding.severity === 'HIGH' && finding.type !== 'DATA_QUALITY' && finding.type !== 'HEALTH_CONTEXT',
  );
  const contextReview = input.rules.findings.some(
    (finding) => finding.severity === 'MEDIUM' && finding.type !== 'DATA_QUALITY' && finding.type !== 'HEALTH_CONTEXT',
  );
  const overall = overallFor({
    hasNutrition,
    hasIngredients,
    concernHigh: concernHigh.length,
    contextConflict,
    contextReview,
  });

  const highlights = orderHighlights(
    readings.filter((item) => item.core || item.emphasized || item.level === 'high'),
  );
  const whatToKnow = whatToKnowFor(readings, emphasized);
  const notableIngredients = notableFor(input.ingredients);
  const whoMayWantToCheck = audienceFor(input.ingredients, input.declarations, byId);
  const contextNotes = notesFor(input.context, emphasized, byId);
  const professionalNote = input.context.healthConditions.length > 0 ? PROFESSIONAL_NOTE : null;

  return {
    overall,
    overallLabel: OVERALL_LABEL[overall],
    overallDetail: contextConflict ? CONTEXT_LIMIT_DETAIL : OVERALL_DETAIL[overall],
    highlights,
    whatToKnow,
    notableIngredients,
    whoMayWantToCheck,
    whoEmpty: AUDIENCE_EMPTY,
    contextNotes,
    professionalNote,
    cautions: cautionsFor(input.rules.findings),
    emphasized: [...emphasized],
  };
}

function overallFor(input: {
  hasNutrition: boolean;
  hasIngredients: boolean;
  concernHigh: number;
  contextConflict: boolean;
  contextReview: boolean;
}): OverallId {
  if (!input.hasNutrition && !input.hasIngredients) return 'insufficient';
  if (input.contextConflict || input.concernHigh >= 2) return 'limit';
  if (input.contextReview || input.concernHigh === 1) return 'review';
  if (!input.hasNutrition) return 'insufficient';
  return 'good';
}

function emphasisFor(context: AnalysisContext): Set<NutrientId> {
  const ids = new Set<NutrientId>();
  for (const condition of context.healthConditions) {
    for (const nutrient of HEALTH_RULES[condition].nutrients) ids.add(nutrient);
  }
  for (const watch of context.thingsToWatch) {
    for (const nutrient of WATCH_NUTRIENTS[watch] ?? []) ids.add(nutrient);
  }
  for (const goal of context.goals) {
    for (const nutrient of GOAL_NUTRIENTS[goal] ?? []) ids.add(nutrient);
  }
  const age = resolvedAge(context);
  if (age !== null) {
    const band = AGE_EMPHASIS.find((rule) => age >= rule.minAge && age <= rule.maxAge);
    for (const nutrient of band?.nutrients ?? []) ids.add(nutrient);
  }
  return ids;
}

function notesFor(
  context: AnalysisContext,
  emphasized: Set<NutrientId>,
  byId: Map<NutrientId, ScoredNutrient>,
): string[] {
  if (!hasPersonalContext(context)) return [];
  const notes: string[] = [];
  for (const condition of context.healthConditions) {
    const note = HEALTH_RULES[condition].note;
    if (note && !notes.includes(note)) notes.push(note);
  }
  const age = resolvedAge(context);
  if (age !== null) {
    const band = AGE_EMPHASIS.find((rule) => age >= rule.minAge && age <= rule.maxAge);
    const present = (band?.nutrients ?? []).filter((id) => byId.get(id)?.level !== 'unknown').map((id) => nutrientName(id));
    if (present.length > 0) {
      notes.push(`For this age, this screen emphasizes ${joinList(present)}.`);
    } else if (band) {
      notes.push('For this age, the nutrients this screen emphasizes were not reported.');
    }
  }
  if (emphasized.size > 0 && notes.length === 0 && (context.thingsToWatch.length > 0 || context.goals.length > 0)) {
    const names = [...emphasized].map(nutrientName);
    notes.push(`This check emphasizes ${joinList(names)} because of the details you added.`);
  }
  return notes;
}

interface ScoredNutrient extends NutritionHighlight {
  meaning: BandMeaning;
  core: boolean;
}

function scoreNutrient(rule: NutrientRule, nutrition: NutritionFacts | null, emphasized: boolean): ScoredNutrient {
  const reading = readNutrient(nutrition, rule);
  if (!reading) {
    return {
      id: rule.id,
      name: rule.name,
      amount: null,
      unit: rule.unit,
      basis: null,
      level: 'unknown',
      levelLabel: LEVEL_LABEL.unknown,
      bar: 0,
      tone: 'neutral',
      emphasized,
      meaning: rule.meaning,
      core: rule.core,
    };
  }
  const level = levelFor(reading.value, reading.band);
  return {
    id: rule.id,
    name: rule.name,
    amount: formatNumber(reading.value),
    unit: rule.unit,
    basis: reading.basis,
    level,
    levelLabel: LEVEL_LABEL[level],
    bar: barFor(reading.value, reading.band.highAbove),
    tone: toneFor(rule.meaning, level),
    emphasized,
    meaning: rule.meaning,
    core: rule.core,
  };
}

function readNutrient(
  nutrition: NutritionFacts | null,
  rule: NutrientRule,
): { value: number; basis: string; band: Band } | null {
  const per100 = nutrition?.per100g?.[rule.field];
  if (typeof per100 === 'number') return { value: per100, basis: 'per 100 g', band: rule.per100g };
  const serving = nutrition?.perServing?.[rule.field];
  if (typeof serving !== 'number' || !rule.perServing) return null;
  return { value: serving, basis: 'per serving', band: rule.perServing };
}

function levelFor(value: number, band: Band): NutrientLevel {
  if (band.highAbove === 0 && band.lowAtMost === 0) return value > 0 ? 'high' : 'low';
  if (value <= band.lowAtMost) return 'low';
  if (value > band.highAbove) return 'high';
  return 'moderate';
}

function barFor(value: number, highAbove: number): number {
  const scale = highAbove > 0 ? highAbove : 1;
  return Math.max(8, Math.min(100, Math.round((value / scale) * 100)));
}

function toneFor(meaning: BandMeaning, level: NutrientLevel): NutritionHighlight['tone'] {
  if (level === 'unknown' || meaning === 'neutral') return 'neutral';
  if (meaning === 'support') {
    if (level === 'high') return 'positive';
    if (level === 'low') return 'attention';
    return 'neutral';
  }
  if (level === 'high') return 'concern';
  if (level === 'moderate') return 'attention';
  return 'positive';
}

function orderHighlights(items: ScoredNutrient[]): NutritionHighlight[] {
  return [...items]
    .sort((left, right) => Number(right.emphasized) - Number(left.emphasized))
    .map(({ meaning: _meaning, core: _core, ...item }) => item);
}

function whatToKnowFor(readings: ScoredNutrient[], emphasized: Set<NutrientId>): string[] {
  const lines: string[] = [];
  const ordered = [...readings].sort((left, right) => Number(right.emphasized) - Number(left.emphasized));
  for (const item of ordered) {
    if (item.level === 'unknown') continue;
    const rule = NUTRIENTS.find((candidate) => candidate.id === item.id);
    const mentioned = emphasized.has(item.id) || (rule?.mention.includes(item.level) ?? false);
    if (!mentioned) continue;
    lines.push(`${item.levelLabel} ${rule?.shortName ?? item.name.toLowerCase()}`);
  }
  return lines.slice(0, 6);
}

function notableFor(ingredients: TaggedIngredient[]): Array<{ name: string; note: string }> {
  const notes: Array<{ name: string; note: string }> = [];
  const seen = new Set<string>();
  for (const ingredient of ingredients) {
    for (const tag of ingredient.tags) {
      const match = NOTABLE_TAGS.find((item) => item.kind === tag.kind && item.id === tag.id);
      if (!match) continue;
      const key = `${ingredient.name}:${match.note}`;
      if (seen.has(key)) continue;
      seen.add(key);
      notes.push({ name: ingredient.name, note: match.note });
    }
  }
  return notes.slice(0, 8);
}

function audienceFor(
  ingredients: TaggedIngredient[],
  declarations: AllergenDeclaration[],
  byId: Map<NutrientId, ScoredNutrient>,
): string[] {
  const flags = new Set(ingredients.flatMap((ingredient) => ingredient.tags.filter((tag) => tag.kind === 'flag').map((tag) => tag.id)));
  const allergens = new Set([
    ...ingredients.flatMap((ingredient) => ingredient.tags.filter((tag) => tag.kind === 'allergen').map((tag) => tag.id)),
    ...declarations.map((item) => item.allergenId),
  ]);
  const lines: string[] = [];
  const covered = new Set<string>();
  for (const rule of AUDIENCE_RULES) {
    const nutrientHit = rule.nutrient ? (rule.levels ?? []).includes(byId.get(rule.nutrient)?.level ?? 'unknown') : false;
    const flagHit = (rule.flags ?? []).some((flag) => flags.has(flag));
    const allergenHit = (rule.allergens ?? []).some((allergen) => allergens.has(allergen));
    if (!nutrientHit && !flagHit && !allergenHit) continue;
    lines.push(rule.text);
    for (const allergen of rule.allergens ?? []) covered.add(allergen);
  }
  for (const allergen of allergens) {
    if (covered.has(allergen)) continue;
    const label = ALLERGEN_LABELS[allergen];
    if (!label) continue;
    lines.push(`People with a ${label} restriction`);
    covered.add(allergen);
  }
  return lines;
}

function cautionsFor(findings: RuleFinding[]): QuickCaution[] {
  return findings
    .filter((finding) => finding.severity !== 'INFO' && CAUTION_TYPES.has(finding.type))
    .slice(0, 4)
    .map((finding) => ({
      id: finding.id,
      title: finding.title,
      detail: CAUTION_DETAIL[finding.type] ?? finding.reason,
    }));
}

function nutrientName(id: NutrientId): string {
  return NUTRIENTS.find((rule) => rule.id === id)?.shortName ?? id;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, '');
}

export function ingredientNote(name: string, notable: Array<{ name: string; note: string }>): string | undefined {
  const match = notable.find((item) => item.name === name);
  return match?.note;
}
