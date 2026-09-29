import { AIService } from '../ai/aiService';
import { env } from '../config/env';
import { DISCLAIMER } from '../rules/disclaimer';
import { analyzeProfile } from '../rules/engine';
import type { RulesInput } from '../rules/types';
import { AppError } from '../utils/errors';
import { prepareIngredients } from './ingredientService';
import type { ProfileView } from './profileService';
import {
  FAMILY_STATUS_LABEL,
  familyHeadline,
  presentAnalysis,
  type AnalysisBody,
  type ApiProduct,
  type FamilyScanBody,
} from './presentAnalysis';
import type { StoredProduct } from './productService';
import { buildSummary } from './summary';

export class AnalysisService {
  constructor(private readonly ai: AIService) {}

  async build(input: {
    profile: ProfileView;
    product: StoredProduct;
    scanType: 'barcode' | 'label';
    countryHint?: string;
  }): Promise<Omit<AnalysisBody, 'id' | 'createdAt'>> {
    const prepared = prepareIngredients(input.product.ingredientsText, {
      mayContain: input.product.declarations.filter((item) => item.presence === 'may_contain').map((item) => item.label),
      source: input.product.source === 'open_food_facts' ? 'Open Food Facts' : 'Label photo',
    });
    const declarations = dedupeDeclarations([...prepared.declarations, ...input.product.declarations]);
    const countryCodes = [...new Set([...input.product.countryCodes, ...(input.countryHint ? [input.countryHint] : [])])];
    const rulesInput: RulesInput = {
      profile: {
        name: input.profile.name,
        ageGroup: input.profile.ageGroup,
        age: input.profile.age,
        diet: input.profile.diet,
        dietaryPreferences: input.profile.dietaryPreferences,
        allergies: input.profile.allergies,
        limits: input.profile.limits,
      },
      ingredients: prepared.ingredients,
      declarations,
      nutrition: input.product.nutrition,
      countryCodes,
      sourceReliability: input.scanType === 'label' ? 'label_photo' : 'database',
      organicClaim: input.product.organicClaim,
      staleProductData: input.product.freshness === 'stale',
    };
    const rules = analyzeProfile(rulesInput);
    const sourceLabel =
      input.product.source === 'open_food_facts'
        ? `Open Food Facts${input.product.sourceUpdatedAt ? `, source updated ${input.product.sourceUpdatedAt}` : ''}`
        : 'ingredient text read from a label photo';
    const template = buildSummary({
      profileName: input.profile.name,
      productName: input.product.name,
      status: rules.status,
      findings: rules.findings,
      clearChecks: rules.clearChecks,
      sourceLabel,
    });
    const explanation = await this.ai.explain({ summary: template, findings: rules.findings, clearChecks: rules.clearChecks });
    const product: ApiProduct = {
      id: input.product.barcode || input.product.id,
      name: input.product.name,
      brand: input.product.brand,
      barcode: input.product.barcode,
      imageUrl: input.product.imageUrl,
      ingredientsText: input.product.ingredientsText || undefined,
      ingredients: [],
      nutrition: input.product.nutritionItems,
      countryCodes,
      source: input.product.source,
      sourceUpdatedAt: input.product.sourceUpdatedAt,
    };

    return presentAnalysis({
      profileId: input.profile.id,
      profileName: input.profile.name,
      product,
      ingredients: prepared.ingredients,
      rules,
      summary: explanation ?? template,
      scanType: input.scanType,
    });
  }

  async buildFamily(input: {
    profiles: ProfileView[];
    product: StoredProduct;
    scanType: 'barcode' | 'label';
    countryHint?: string;
  }): Promise<Omit<FamilyScanBody, 'id' | 'createdAt'>> {
    if (input.profiles.length === 0) {
      throw new AppError('Add a family profile before scanning.', 400, 'VALIDATION_ERROR');
    }

    const prepared = prepareIngredients(input.product.ingredientsText, {
      mayContain: input.product.declarations.filter((item) => item.presence === 'may_contain').map((item) => item.label),
      source: input.product.source === 'open_food_facts' ? 'Open Food Facts' : 'Label photo',
    });
    const declarations = dedupeDeclarations([...prepared.declarations, ...input.product.declarations]);
    const countryCodes = [...new Set([...input.product.countryCodes, ...(input.countryHint ? [input.countryHint] : [])])];
    const product: ApiProduct = {
      id: input.product.barcode || input.product.id,
      name: input.product.name,
      brand: input.product.brand,
      barcode: input.product.barcode,
      imageUrl: input.product.imageUrl,
      ingredientsText: input.product.ingredientsText || undefined,
      ingredients: prepared.ingredients.map((ingredient, index) => ({
        id: `ingredient-${index}`,
        name: ingredient.name,
        flagged: false,
      })),
      nutrition: input.product.nutritionItems,
      countryCodes,
      source: input.product.source,
      sourceUpdatedAt: input.product.sourceUpdatedAt,
    };

    const profileAnalyses = input.profiles.map((profile) => {
      const rules = analyzeProfile({
        profile: {
          name: profile.name,
          ageGroup: profile.ageGroup,
          age: profile.age,
          diet: profile.diet,
          dietaryPreferences: profile.dietaryPreferences,
          allergies: profile.allergies,
          limits: profile.limits,
          healthContext: activeHealthContext(profile.healthContext),
        },
        ingredients: prepared.ingredients,
        declarations,
        nutrition: input.product.nutrition,
        countryCodes,
        sourceReliability: input.scanType === 'label' ? 'label_photo' : 'database',
        organicClaim: input.product.organicClaim,
        staleProductData: input.product.freshness === 'stale',
      });
      const headline = familyHeadline(rules.status, rules.findings);
      return presentAnalysis({
        profileId: profile.id,
        profileName: profile.name,
        product,
        ingredients: prepared.ingredients,
        rules,
        summary: headline,
        scanType: input.scanType,
      });
    });

    return {
      scanType: input.scanType,
      scope: 'family',
      disclaimer: DISCLAIMER,
      product,
      familySummary: profileAnalyses.map((analysis) => {
        const headline = familyHeadline(analysis.status, analysis.findings);
        return {
          profileId: analysis.profileId,
          profileName: analysis.profileName,
          status: analysis.status,
          statusLabel: FAMILY_STATUS_LABEL[analysis.status],
          headline,
          topConcern: headline,
        };
      }),
      profileAnalyses,
    };
  }
}

function activeHealthContext(context: {
  enabled: boolean;
  paused: boolean;
  biomarkers: Array<{ name: string; interpretation: 'elevated' | 'low' | 'normal' | 'borderline' | null; confirmedByUser: boolean }>;
  dietaryRecommendations: Array<{ recommendation: string; confirmedByUser: boolean }>;
} | undefined) {
  if (!context?.enabled || context.paused) return undefined;
  return {
    enabled: true,
    biomarkers: context.biomarkers
      .filter((item) => item.confirmedByUser)
      .map((item) => ({ name: item.name, interpretation: item.interpretation })),
    dietaryRecommendations: context.dietaryRecommendations
      .filter((item) => item.confirmedByUser)
      .map((item) => item.recommendation),
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

export const aiService = new AIService({
  baseUrl: env.aiBaseUrl,
  apiKey: env.aiApiKey,
  visionModel: env.aiVisionModel,
  explanationModel: env.aiExplanationModel,
  timeoutMs: env.aiTimeoutMs,
});

export const analysisService = new AnalysisService(aiService);
