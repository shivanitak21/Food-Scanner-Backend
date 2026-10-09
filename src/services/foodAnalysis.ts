import { DISCLAIMER } from '../rules/disclaimer';
import {
  assessProduct,
  ingredientNote,
  type NutritionHighlight,
  type ProductAssessment,
  type QuickCaution,
} from '../rules/assessment';
import {
  hasPersonalContext,
  normalizeContext,
  profileDraftFromContext,
  profileFromContext,
  type AnalysisContext,
  type ProfileDraft,
} from '../rules/context';
import { analyzeProfile } from '../rules/engine';
import type { RulesInput } from '../rules/types';
import { prepareIngredients } from './ingredientService';
import type { ApiIngredient, ApiProduct } from './presentAnalysis';
import type { StoredProduct } from './productService';

export interface QuickScanBody {
  scope: 'quick';
  id: string;
  productId: string;
  createdAt: string;
  scanType: 'barcode' | 'label';
  disclaimer: string;
  product: ApiProduct;
  overall: ProductAssessment['overall'];
  overallLabel: string;
  overallDetail: string;
  highlights: NutritionHighlight[];
  whatToKnow: string[];
  notableIngredients: ProductAssessment['notableIngredients'];
  whoMayWantToCheck: string[];
  whoEmpty: string;
  contextNotes: string[];
  professionalNote: string | null;
  cautions: QuickCaution[];
  ingredients: ApiIngredient[];
  context: {
    age: number | null;
    dateOfBirth: string | null;
    diet: AnalysisContext['diet'];
    dietaryPreferences: string[];
    allergies: string[];
    healthConditions: AnalysisContext['healthConditions'];
    goals: string[];
    thingsToWatch: string[];
    eating: string[];
    hasContext: boolean;
  };
  profileDraft: ProfileDraft;
}

export function buildQuickAnalysis(input: {
  product: StoredProduct;
  context?: Partial<AnalysisContext> | null;
  scanType: 'barcode' | 'label';
  countryHint?: string;
  labelConfirmed?: boolean;
}): QuickScanBody {
  const context = normalizeContext(input.context);
  const prepared = prepareIngredients(input.product.ingredientsText, {
    mayContain: input.product.declarations.filter((item) => item.presence === 'may_contain').map((item) => item.label),
    source: input.product.source === 'open_food_facts' ? 'Open Food Facts' : 'Label photo',
  });
  const declarations = dedupeDeclarations([...prepared.declarations, ...input.product.declarations]);
  const countryCodes = [...new Set([...input.product.countryCodes, ...(input.countryHint ? [input.countryHint] : [])])];
  const rulesInput: RulesInput = {
    profile: profileFromContext(context),
    ingredients: prepared.ingredients,
    declarations,
    nutrition: input.product.nutrition,
    countryCodes,
    sourceReliability: input.labelConfirmed
      ? 'confirmed_label'
      : input.scanType === 'label'
        ? 'label_photo'
        : 'database',
    organicClaim: input.product.organicClaim,
    staleProductData: input.product.freshness === 'stale',
  };
  const rules = analyzeProfile(rulesInput);
  const assessment = assessProduct({
    ingredients: prepared.ingredients,
    declarations,
    nutrition: input.product.nutrition,
    rules,
    context,
  });
  const ingredients = prepared.ingredients.map((ingredient, index) => {
    const note = ingredientNote(ingredient.name, assessment.notableIngredients);
    return {
      id: `ingredient-${index}`,
      name: ingredient.name,
      flagged: Boolean(note),
      reason: note,
      details: note,
    };
  });
  const product: ApiProduct = {
    id: input.product.barcode || input.product.id,
    name: input.product.name,
    brand: input.product.brand,
    barcode: input.product.barcode,
    imageUrl: input.product.imageUrl,
    ingredientsText: input.product.ingredientsText || undefined,
    ingredients,
    nutrition: input.product.nutritionItems,
    countryCodes,
    source: input.product.source,
    sourceUpdatedAt: input.product.sourceUpdatedAt,
  };
  const draft = profileDraftFromContext(context);

  return {
    scope: 'quick',
    id: `quick-${input.product.id}`,
    productId: input.product.id,
    createdAt: new Date().toISOString(),
    scanType: input.scanType,
    disclaimer: DISCLAIMER,
    product,
    overall: assessment.overall,
    overallLabel: assessment.overallLabel,
    overallDetail: assessment.overallDetail,
    highlights: assessment.highlights,
    whatToKnow: assessment.whatToKnow,
    notableIngredients: assessment.notableIngredients,
    whoMayWantToCheck: assessment.whoMayWantToCheck,
    whoEmpty: assessment.whoEmpty,
    contextNotes: assessment.contextNotes,
    professionalNote: assessment.professionalNote,
    cautions: assessment.cautions,
    ingredients,
    context: {
      age: draft.age,
      dateOfBirth: context.dateOfBirth,
      diet: context.diet,
      dietaryPreferences: context.dietaryPreferences,
      allergies: context.allergies,
      healthConditions: context.healthConditions,
      goals: context.goals,
      thingsToWatch: context.thingsToWatch,
      eating: context.eating,
      hasContext: hasPersonalContext(context),
    },
    profileDraft: draft,
  };
}

function dedupeDeclarations(items: RulesInput['declarations']): RulesInput['declarations'] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.allergenId}:${item.presence}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
