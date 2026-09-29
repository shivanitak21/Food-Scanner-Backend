import { DISCLAIMER, STATUS_LABEL } from '../rules/disclaimer';
import { canon } from '../rules/text';
import type { AnalysisStatus, Evidence, RuleFinding, RulesResult, TaggedIngredient } from '../rules/types';
import type { NutritionItem } from './nutrition';

export interface ApiEvidence {
  id: string;
  title: string;
  detail?: string;
  source?: string;
  url?: string;
}

export interface ApiFinding {
  id: string;
  type: RuleFinding['type'];
  title: string;
  ingredient?: string;
  ingredientName?: string;
  nutrient?: string;
  value?: string;
  unit?: string;
  severity: RuleFinding['severity'];
  reason: string;
  shortReason: string;
  explanation: string;
  detection: RuleFinding['detection'];
  evidence: string;
  evidenceItems: ApiEvidence[];
}

export interface ApiIngredient {
  id: string;
  name: string;
  flagged: boolean;
  reason?: string;
  details?: string;
}

export interface ApiProduct {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  imageUrl?: string;
  ingredientsText?: string;
  ingredients: ApiIngredient[];
  nutrition: NutritionItem[];
  countryCodes: string[];
  source: 'open_food_facts' | 'label_ocr';
  sourceUpdatedAt?: string;
}

export interface AnalysisBody {
  id: string;
  createdAt: string;
  scanType: 'barcode' | 'label';
  profileId: string;
  profileName: string;
  status: AnalysisStatus;
  statusLabel: string;
  summary: string;
  disclaimer: string;
  product: ApiProduct;
  findings: ApiFinding[];
  concerns: ApiFinding[];
  allergens: ApiFinding[];
  nutritionConcerns: ApiFinding[];
  relevantIngredients: ApiFinding[];
  ingredients: ApiIngredient[];
  nutrition: NutritionItem[];
  evidence: ApiEvidence[];
  countryPacks: RulesResult['countryPacks'];
  limitations: string[];
}

const NUTRITION_TYPES = new Set(['ADDED_SUGAR', 'SODIUM', 'SATURATED_FAT', 'CAFFEINE', 'ARTIFICIAL_SWEETENER']);

export function presentAnalysis(input: {
  profileId: string;
  profileName: string;
  product: ApiProduct;
  ingredients: TaggedIngredient[];
  rules: RulesResult;
  summary: string;
  scanType: 'barcode' | 'label';
}): Omit<AnalysisBody, 'id' | 'createdAt'> {
  const findings = input.rules.findings.map(toApiFinding);
  const ingredients = flagIngredients(input.ingredients, input.rules.findings);
  const product = { ...input.product, ingredients, nutrition: input.product.nutrition };
  const evidence = [
    ...findings.flatMap((finding) => finding.evidenceItems),
    ...input.rules.limitations.map((limitation, index) => ({
      id: `limitation-${index}`,
      title: 'Limit of this screen',
      detail: limitation,
    })),
  ];

  return {
    scanType: input.scanType,
    profileId: input.profileId,
    profileName: input.profileName,
    status: input.rules.status,
    statusLabel: STATUS_LABEL[input.rules.status],
    summary: input.summary,
    disclaimer: DISCLAIMER,
    product,
    findings,
    concerns: findings.filter(
      (finding) => finding.type === 'AGE' || finding.type === 'DATA_QUALITY' || finding.type === 'HEALTH_CONTEXT',
    ),
    allergens: findings.filter((finding) => finding.type === 'ALLERGEN'),
    nutritionConcerns: findings.filter((finding) => NUTRITION_TYPES.has(finding.type)),
    relevantIngredients: findings.filter((finding) => finding.type === 'DIET' || finding.type === 'PREFERENCE' || finding.type === 'LIMIT'),
    ingredients,
    nutrition: product.nutrition,
    evidence,
    countryPacks: input.rules.countryPacks,
    limitations: input.rules.limitations,
  };
}

const NUTRIENT_LABEL: Partial<Record<RuleFinding['type'], string>> = {
  SATURATED_FAT: 'Saturated fat',
  SODIUM: 'Sodium',
  ADDED_SUGAR: 'Added sugar',
  CAFFEINE: 'Caffeine',
  ARTIFICIAL_SWEETENER: 'Artificial sweetener',
};

function toApiFinding(finding: RuleFinding): ApiFinding {
  const evidenceItems = finding.evidence.map((item, index) => toEvidence(item, `${finding.id}-${index}`));
  const measure = measureFrom(finding);
  return {
    id: finding.id,
    type: finding.type,
    title: finding.title,
    ingredient: finding.ingredient,
    ingredientName: finding.ingredient,
    nutrient: NUTRIENT_LABEL[finding.type],
    value: measure?.value,
    unit: measure?.unit,
    severity: finding.severity,
    reason: finding.reason,
    shortReason: shortReason(finding),
    explanation: shortReason(finding),
    detection: finding.detection,
    evidence: evidenceItems
      .map((item) => [item.title, item.detail, item.source].filter(Boolean).join(' — '))
      .join(' '),
    evidenceItems,
  };
}

function shortReason(finding: RuleFinding): string {
  if (/screening threshold|screening level/i.test(finding.reason)) {
    return 'Above the configured screening level.';
  }
  if (finding.type === 'ALLERGEN') return 'Listed allergen for this profile.';
  if (finding.type === 'DIET') return 'Does not match this profile’s diet.';
  if (finding.severity === 'INFO') return 'Noted from the available product data.';
  const sentence = finding.reason.replace(/\s+/g, ' ').trim();
  const end = sentence.search(/[.!](\s|$)/);
  const clipped = end > 0 ? sentence.slice(0, end + 1) : sentence;
  return clipped.length > 96 ? `${clipped.slice(0, 92).trim()}…` : clipped;
}

function measureFrom(finding: RuleFinding): { value: string; unit: string } | undefined {
  const blob = [finding.reason, ...finding.evidence.map((item) => `${item.title} ${item.detail ?? ''}`)].join(' ');
  const match = blob.match(/(\d+(?:[.,]\d+)?)\s*(kcal|g|mg|mcg|µg|%)\b/i);
  if (!match) return undefined;
  return { value: match[1].replace(',', '.'), unit: match[2].toLowerCase() };
}

function toEvidence(evidence: Evidence, id: string): ApiEvidence {
  return {
    id,
    title: evidence.title,
    detail: evidence.detail,
    source: evidence.source,
    url: evidence.url,
  };
}

function categoryLabel(type: RuleFinding['type']): string {
  switch (type) {
    case 'ALLERGEN':
      return 'Allergen';
    case 'DIET':
    case 'PREFERENCE':
      return 'Diet';
    case 'SATURATED_FAT':
    case 'SODIUM':
    case 'ADDED_SUGAR':
    case 'CAFFEINE':
    case 'ARTIFICIAL_SWEETENER':
      return 'Nutrition';
    case 'AGE':
      return 'Life stage';
    default:
      return 'Ingredient';
  }
}

export const FAMILY_STATUS_LABEL: Record<AnalysisStatus, string> = {
  suitable: 'Looks okay',
  review: 'Review',
  avoid: 'Important',
};

export interface FamilyMemberSummary {
  profileId: string;
  profileName: string;
  status: AnalysisStatus;
  statusLabel: string;
  headline: string;
  topConcern: string;
}

export interface FamilyScanBody {
  id: string;
  createdAt: string;
  scanType: 'barcode' | 'label';
  scope: 'family';
  disclaimer: string;
  product: ApiProduct;
  familySummary: FamilyMemberSummary[];
  profileAnalyses: Array<Omit<AnalysisBody, 'id' | 'createdAt'>>;
}

const HEADLINE_RULES: Array<[RegExp, string]> = [
  [/saturated fat/i, 'High saturated fat'],
  [/sodium|salt/i, 'High sodium'],
  [/added sugar|sugar/i, 'Added sugar'],
  [/caffeine/i, 'Caffeine'],
  [/sweetener/i, 'Artificial sweetener'],
  [/honey/i, 'Honey listed'],
  [/gluten/i, 'Gluten'],
  [/organic/i, 'No organic claim'],
  [/unavailable|missing|stale|label photo/i, 'Limited data'],
];

export function familyHeadline(
  status: AnalysisStatus,
  findings: Array<{ title: string; severity: string; type?: string }>,
): string {
  if (status === 'suitable') return 'Looks okay';
  const rank = (severity: string) => (severity === 'HIGH' ? 3 : severity === 'MEDIUM' ? 2 : severity === 'LOW' ? 1 : 0);
  const top = [...findings].sort((left, right) => rank(right.severity) - rank(left.severity))[0];
  if (!top) return FAMILY_STATUS_LABEL[status];
  if (top.type === 'HEALTH_CONTEXT') return 'Health context';
  for (const [pattern, label] of HEADLINE_RULES) {
    if (pattern.test(top.title)) return label;
  }
  const cleaned = top.title.replace(/[“”"]/g, '').trim();
  return cleaned.length <= 32 ? cleaned : FAMILY_STATUS_LABEL[status];
}

function flagIngredients(ingredients: TaggedIngredient[], findings: RuleFinding[]): ApiIngredient[] {
  return ingredients.map((ingredient, index) => {
    const match = findings.find(
      (finding) =>
        finding.severity !== 'INFO' &&
        finding.ingredient !== undefined &&
        canon(finding.ingredient) === canon(ingredient.name),
    );
    return {
      id: `ingredient-${index}`,
      name: ingredient.name,
      flagged: Boolean(match),
      reason: match ? 'Relevant to this profile.' : undefined,
      details: match ? categoryLabel(match.type) : undefined,
    };
  });
}
