import { AIService } from '../ai/aiService';
import { env } from '../config/env';
import { DISCLAIMER } from '../rules/disclaimer';
import { analyzeProfile, rollupStatus } from '../rules/engine';
import { findingsFromReportMatches, reportComparisonUnavailable, type ConfirmedReport } from '../rules/healthContext';
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

    const profileAnalyses = await Promise.all(
      input.profiles.map((profile) =>
        this.reviewProfile({
          profile,
          product: input.product,
          scanType: input.scanType,
          countryHint: input.countryHint,
        }),
      ),
    );
    const product = profileAnalyses[0]?.product;

    return {
      scanType: input.scanType,
      scope: 'family',
      disclaimer: DISCLAIMER,
      product: product ?? {
        id: input.product.barcode || input.product.id,
        name: input.product.name,
        brand: input.product.brand,
        barcode: input.product.barcode,
        imageUrl: input.product.imageUrl,
        ingredientsText: input.product.ingredientsText || undefined,
        ingredients: [],
        nutrition: input.product.nutritionItems,
        countryCodes: input.product.countryCodes,
        source: input.product.source,
        sourceUpdatedAt: input.product.sourceUpdatedAt,
      },
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

  async reviewProfile(input: {
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
    const productText = [
      input.product.name,
      ...prepared.ingredients.map((ingredient) => ingredient.name),
      ...input.product.nutritionItems.map((item) => [item.name, item.amount, item.unit].filter(Boolean).join(' ')),
    ].join('\n');
    const rules = analyzeProfile({
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
    });
    const report = confirmedReport(input.profile.healthContext);
    if (report) {
      const compared = await this.ai.personalizeReport({
        report,
        productName: input.product.name,
        ingredients: prepared.ingredients.map((ingredient) => ingredient.name),
        nutrition: input.product.nutritionItems.map((item) => ({
          name: item.name,
          amount: item.amount,
          unit: item.unit,
        })),
      });
      const extra = compared.ok
        ? findingsFromReportMatches({ report, productText, matches: compared.matches })
        : [reportComparisonUnavailable()];
      rules.findings = [...rules.findings, ...extra];
      rules.status = rollupStatus(rules.findings);
    }
    const decision = rules.status === 'avoid' ? "Don't eat" : rules.status === 'review' ? 'Check first' : 'Can eat';
    const titles = rules.findings.filter((finding) => finding.severity !== 'INFO').map((finding) => finding.title).slice(0, 4);
    const recommendation = await this.ai.recommend({ decision, findings: titles });
    return presentAnalysis({
      profileId: input.profile.id,
      profileName: input.profile.name,
      product,
      ingredients: prepared.ingredients,
      rules,
      summary: recommendation ?? (titles[0] ? `${decision}. ${titles[0]}.` : `${decision}.`),
      scanType: input.scanType,
    });
  }
}

function confirmedReport(context: {
  enabled: boolean;
  paused: boolean;
  biomarkers: Array<{
    name: string;
    value: number | null;
    unit: string | null;
    interpretation: 'elevated' | 'low' | 'normal' | 'borderline' | null;
    confirmedByUser: boolean;
  }>;
  dietaryRecommendations: Array<{ recommendation: string; confirmedByUser: boolean }>;
} | undefined): ConfirmedReport | null {
  if (!context?.enabled || context.paused) return null;
  const biomarkers = context.biomarkers
    .filter((item) => item.confirmedByUser && item.name.trim())
    .map((item) => ({
      name: item.name.trim(),
      value: item.value,
      unit: item.unit,
      interpretation: item.interpretation,
    }));
  const dietaryRecommendations = context.dietaryRecommendations
    .filter((item) => item.confirmedByUser && item.recommendation.trim())
    .map((item) => item.recommendation.trim());
  if (biomarkers.length + dietaryRecommendations.length === 0) return null;
  return { biomarkers, dietaryRecommendations };
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
