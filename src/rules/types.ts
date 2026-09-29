export type AnalysisStatus = 'suitable' | 'review' | 'avoid';

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type DetectionKind = 'detected' | 'may_contain' | 'inferred' | 'nutrition_label' | 'missing_data';

export type FindingType =
  | 'ALLERGEN'
  | 'DIET'
  | 'ADDED_SUGAR'
  | 'SODIUM'
  | 'SATURATED_FAT'
  | 'CAFFEINE'
  | 'ARTIFICIAL_SWEETENER'
  | 'AGE'
  | 'PREFERENCE'
  | 'LIMIT'
  | 'DATA_QUALITY'
  | 'HEALTH_CONTEXT';

export type AgeGroup = 'baby' | 'child' | 'teen' | 'adult' | 'older_adult';

export type DietPreference = 'none' | 'vegetarian' | 'vegan';

export type SourceReliability = 'database' | 'label_photo';

export interface Evidence {
  title: string;
  detail?: string;
  source?: string;
  url?: string;
}

export interface RuleFinding {
  id: string;
  type: FindingType;
  title: string;
  ingredient?: string;
  severity: Severity;
  reason: string;
  detection: DetectionKind;
  evidence: Evidence[];
}

export interface IngredientTag {
  id: string;
  kind: 'allergen' | 'flag';
  detection: 'detected' | 'inferred';
  term: string;
}

export interface TaggedIngredient {
  raw: string;
  name: string;
  tags: IngredientTag[];
}

export interface AllergenDeclaration {
  allergenId: string;
  label: string;
  presence: 'detected' | 'may_contain';
  source: string;
}

export interface NutrientAmount {
  sugarsG?: number;
  sodiumMg?: number;
  saturatedFatG?: number;
  energyKcal?: number;
  fatG?: number;
  carbohydratesG?: number;
  proteinG?: number;
  saltG?: number;
}

export interface NutritionFacts {
  per100g?: NutrientAmount;
  perServing?: NutrientAmount & { servingSize?: string };
}

export type HealthInterpretation = 'elevated' | 'low' | 'normal' | 'borderline';

export interface HealthContextRules {
  enabled: boolean;
  biomarkers: Array<{ name: string; interpretation: HealthInterpretation | null }>;
  dietaryRecommendations: string[];
}

export interface ProfileRules {
  name: string;
  ageGroup: AgeGroup | null;
  age: number | null;
  diet: DietPreference;
  dietaryPreferences: string[];
  allergies: string[];
  limits: string[];
  healthContext?: HealthContextRules;
}

export interface RulesInput {
  profile: ProfileRules;
  ingredients: TaggedIngredient[];
  declarations: AllergenDeclaration[];
  nutrition: NutritionFacts | null;
  countryCodes: string[];
  sourceReliability: SourceReliability;
  organicClaim: boolean | null;
  staleProductData: boolean;
}

export interface RulesResult {
  status: AnalysisStatus;
  findings: RuleFinding[];
  clearChecks: string[];
  countryPacks: Array<{ code: string; name: string; authority: string }>;
  limitations: string[];
}
