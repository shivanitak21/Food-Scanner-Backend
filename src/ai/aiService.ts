import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';

import { logger } from '../config/logger';
import type { RuleFinding } from '../rules/types';
import { normalizeIngredientText } from '../services/ocrNormalize';
import { nutritionFromLabelItems, type NutritionItem } from '../services/nutrition';
import type { NutritionFacts } from '../rules/types';
import { AppError } from '../utils/errors';
import { explanationIsUsable } from './explanationGuard';
import type { ConfirmedReport, ReportMatchDraft } from '../rules/healthContext';
import { EXPLANATION_INSTRUCTIONS, HEALTH_EXTRACT_INSTRUCTIONS, RECOMMENDATION_INSTRUCTIONS, REPORT_MATCH_INSTRUCTIONS, VISION_INSTRUCTIONS } from './prompts';

export interface LabelExtraction {
  productName: string;
  brand: string;
  variant: string;
  category: string;
  claims: string[];
  ingredientsText: string;
  contains: string[];
  mayContain: string[];
  nutrition: NutritionFacts | null;
  nutritionItems: NutritionItem[];
}

const healthDraftSchema = z.object({
  unreadable: z.boolean().optional().default(false),
  biomarkers: z
    .array(
      z.object({
        name: z.string().optional().default(''),
        value: z.preprocess((value) => (value == null ? '' : String(value)), z.string()).optional().default(''),
        unit: z.string().optional().default(''),
        interpretation: z.string().optional().default(''),
        date: z.string().optional().default(''),
      }),
    )
    .optional()
    .default([]),
  dietaryRecommendations: z
    .array(
      z.object({
        recommendation: z.string().optional().default(''),
        source: z.string().optional().default(''),
      }),
    )
    .optional()
    .default([]),
});

function normalizeInterpretation(value: string): 'elevated' | 'low' | 'normal' | 'borderline' | null {
  const text = value.trim().toLowerCase();
  if (text === 'elevated' || text === 'high' || text === 'above range') return 'elevated';
  if (text === 'low' || text === 'below range') return 'low';
  if (text === 'normal' || text === 'within range') return 'normal';
  if (text === 'borderline') return 'borderline';
  return null;
}

const recommendationSchema = z.object({
  recommendation: z.string().optional().default(''),
});

const reportMatchSchema = z.object({
  matches: z
    .array(
      z.object({
        reportItem: z.string().optional().default(''),
        productDetail: z.string().optional().default(''),
        reason: z.string().optional().default(''),
      }),
    )
    .optional()
    .default([]),
});

const extractionSchema = z.object({
  productName: z.string().optional().default(''),
  brand: z.string().optional().default(''),
  variant: z.string().optional().default(''),
  category: z.string().optional().default(''),
  claims: z.array(z.string()).optional().default([]),
  ingredientsText: z.string().optional().default(''),
  contains: z.array(z.string()).optional().default([]),
  mayContain: z.array(z.string()).optional().default([]),
  nutrition: z
    .array(
      z.object({
        name: z.string(),
        amount: z.string(),
        unit: z.string().optional(),
        basis: z.enum(['per_100g', 'per_serving', 'unknown']).optional(),
      }),
    )
    .optional()
    .default([]),
  unreadable: z.boolean().optional().default(false),
});

export class AIService {
  private readonly http: AxiosInstance;

  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey: string;
      visionModel: string;
      explanationModel: string;
      timeoutMs: number;
    },
  ) {
    this.http = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {},
    });
  }

  isConfigured(): boolean {
    return this.options.apiKey.length > 0;
  }

  async extractLabel(image: Buffer, mimeType: string, options?: { allowPartial?: boolean }): Promise<LabelExtraction> {
    if (!this.isConfigured()) {
      throw new AppError(
        'Label reading is not configured. Add an AI API key on the server, or scan a barcode.',
        503,
        'AI_NOT_CONFIGURED',
      );
    }

    const content = await this.complete(
      this.options.visionModel,
      true,
      [
        { role: 'system', content: VISION_INSTRUCTIONS },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the ingredient list and nutrition numbers from this package photo.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${image.toString('base64')}` } },
          ],
        },
      ],
      1200,
    );

    let parsed: z.infer<typeof extractionSchema>;
    try {
      parsed = extractionSchema.parse(parseModelJson(content));
    } catch (error) {
      logger.warn({ message: error instanceof Error ? error.message : 'invalid json' }, 'vision response rejected');
      throw new AppError('The label reader returned an unreadable response. Try the photo again.', 502, 'AI_RESPONSE');
    }

    const ingredientsText = normalizeIngredientText(parsed.ingredientsText).slice(0, 20000);
    const nutrition = nutritionFromLabelItems(parsed.nutrition);
    if ((parsed.unreadable || ingredientsText.length === 0) && nutrition.items.length === 0) {
      if (options?.allowPartial) {
        return {
          productName: parsed.productName.trim().slice(0, 200),
          brand: parsed.brand.trim().slice(0, 120),
          variant: parsed.variant.trim().slice(0, 80),
          category: parsed.category.trim().slice(0, 80),
          claims: parsed.claims.map((item) => item.trim()).filter(Boolean).slice(0, 12),
          ingredientsText: '',
          contains: [],
          mayContain: [],
          nutrition: null,
          nutritionItems: [],
        };
      }
      throw new AppError(
        'The ingredient list could not be read from that photo. Retake it in even light, with the ingredients filling the frame.',
        422,
        'LABEL_UNREADABLE',
      );
    }

    return {
      productName: parsed.productName.trim().slice(0, 200) || 'Scanned label',
      brand: parsed.brand.trim().slice(0, 120),
      variant: parsed.variant.trim().slice(0, 80),
      category: parsed.category.trim().slice(0, 80),
      claims: parsed.claims.map((item) => item.trim()).filter(Boolean).slice(0, 12),
      ingredientsText,
      contains: parsed.contains.map((item) => item.trim()).filter(Boolean).slice(0, 40),
      mayContain: parsed.mayContain.map((item) => item.trim()).filter(Boolean).slice(0, 40),
      nutrition: nutrition.facts,
      nutritionItems: nutrition.items,
    };
  }

  async extractHealthContext(image: Buffer, mimeType: string): Promise<{
    biomarkers: Array<{ name: string; value: number | null; unit: string | null; interpretation: string | null; date: string | null }>;
    dietaryRecommendations: Array<{ recommendation: string; source: string | null }>;
  }> {
    if (!this.isConfigured()) {
      throw new AppError('Report reading is not configured on the server.', 503, 'AI_NOT_CONFIGURED');
    }
    const content = await this.complete(
      this.options.visionModel,
      true,
      [
        { role: 'system', content: HEALTH_EXTRACT_INSTRUCTIONS },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract only printed nutrition-related values. Do not diagnose.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${image.toString('base64')}` } },
          ],
        },
      ],
      900,
    );
    const parsed = healthDraftSchema.parse(parseModelJson(content));
    if (parsed.unreadable) {
      throw new AppError('That page could not be read. Photograph it flat, with the values filling the frame.', 422, 'LABEL_UNREADABLE');
    }
    return {
      biomarkers: parsed.biomarkers
        .map((item) => ({
          name: item.name.trim().slice(0, 80),
          value: item.value.trim() ? Number(item.value.replace(/,/g, '')) : null,
          unit: item.unit.trim().slice(0, 24) || null,
          interpretation: normalizeInterpretation(item.interpretation),
          date: item.date.trim().slice(0, 40) || null,
        }))
        .filter((item) => item.name && (item.value !== null || item.interpretation))
        .slice(0, 12),
      dietaryRecommendations: parsed.dietaryRecommendations
        .map((item) => ({
          recommendation: item.recommendation.trim().slice(0, 180),
          source: item.source.trim().slice(0, 80) || null,
        }))
        .filter((item) => item.recommendation)
        .slice(0, 8),
    };
  }

  async personalizeReport(input: {
    report: ConfirmedReport;
    productName: string;
    ingredients: string[];
    nutrition: Array<{ name: string; amount: string; unit?: string }>;
  }): Promise<{ ok: true; matches: ReportMatchDraft[] } | { ok: false }> {
    if (!this.isConfigured()) return { ok: false };
    try {
      const content = await this.complete(
        this.options.explanationModel,
        true,
        [
          { role: 'system', content: REPORT_MATCH_INSTRUCTIONS },
          { role: 'user', content: JSON.stringify(input) },
        ],
        700,
      );
      const parsed = reportMatchSchema.parse(parseModelJson(content));
      return {
        ok: true,
        matches: parsed.matches
          .map((item) => ({
            reportItem: item.reportItem.trim(),
            productDetail: item.productDetail.trim(),
            reason: item.reason.trim(),
          }))
          .filter((item) => item.reportItem && item.productDetail && item.reason)
          .slice(0, 8),
      };
    } catch (error) {
      logger.warn({ message: error instanceof Error ? error.message : 'report match failed' }, 'report comparison skipped');
      return { ok: false };
    }
  }

  async recommend(input: { decision: 'Good fit' | 'Review' | "Doesn't fit" | 'Not enough information'; findings: string[] }): Promise<string | null> {
    if (!this.isConfigured()) return null;
    try {
      const content = await this.complete(
        this.options.explanationModel,
        true,
        [
          { role: 'system', content: RECOMMENDATION_INSTRUCTIONS },
          { role: 'user', content: JSON.stringify(input) },
        ],
        120,
      );
      const parsed = recommendationSchema.parse(parseModelJson(content));
      const text = parsed.recommendation.replace(/\s+/g, ' ').trim();
      return text ? text.slice(0, 180) : null;
    } catch (error) {
      logger.warn({ message: error instanceof Error ? error.message : 'recommendation failed' }, 'recommendation skipped');
      return null;
    }
  }

  async explain(input: { summary: string; findings: RuleFinding[]; clearChecks: string[] }): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const mustMention = input.findings
      .filter((finding) => finding.severity === 'HIGH' && finding.ingredient)
      .map((finding) => finding.ingredient as string);

    try {
      const content = await this.complete(
        this.options.explanationModel,
        false,
        [
          { role: 'system', content: EXPLANATION_INSTRUCTIONS },
          {
            role: 'user',
            content: JSON.stringify({
              summary: input.summary,
              highSeverityIngredients: mustMention,
              findings: input.findings.map((finding) => ({
                type: finding.type,
                ingredient: finding.ingredient,
                severity: finding.severity,
                detection: finding.detection,
                reason: finding.reason,
              })),
              clearChecks: input.clearChecks,
            }),
          },
        ],
        350,
      );
      const text = proseFromModel(content);
      if (!explanationIsUsable(text, mustMention)) {
        logger.info('explanation rejected; using the rule summary');
        return null;
      }
      return text;
    } catch (error) {
      logger.warn({ message: error instanceof Error ? error.message : 'explanation failed' }, 'explanation skipped');
      return null;
    }
  }

  private async complete(model: string, json: boolean, messages: unknown[], maxTokens: number): Promise<string> {
    try {
      const response = await this.http.post('/chat/completions', {
        model,
        temperature: 0,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        messages,
      });
      const content = response.data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new AppError('The AI service returned an empty response.', 502, 'AI_RESPONSE');
      }
      return content;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw openAiFailure(error);
    }
  }
}

function openAiFailure(error: unknown): AppError {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const body = axios.isAxiosError(error) ? error.response?.data : undefined;
  const apiError =
    body && typeof body === 'object' && 'error' in body
      ? (body as { error?: { code?: string; message?: string } }).error
      : undefined;
  const code = apiError?.code;
  const detail = apiError?.message;
  logger.warn({ status, code, message: detail ?? (error instanceof Error ? error.message : 'request failed') }, 'AI request failed');
  if (status === 401 || code === 'invalid_api_key') {
    return new AppError('The AI API key was rejected. Replace AI_API_KEY on the server and restart it.', 502, 'AI_UNAUTHORIZED');
  }
  if (code === 'insufficient_quota' || (typeof detail === 'string' && /quota|billing/i.test(detail))) {
    return new AppError(
      'The OpenAI account has no remaining credit. Add a payment method and credit, then try the page again.',
      502,
      'AI_QUOTA',
    );
  }
  if (status === 429) {
    return new AppError('The label reader is busy. Wait a minute and try again.', 429, 'AI_RATE_LIMIT');
  }
  return new AppError('The label reader could not be reached. Try again in a moment.', 502, 'AI_UNAVAILABLE');
}

function proseFromModel(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = parseModelJson(trimmed) as { explanation?: unknown; summary?: unknown; text?: unknown };
      const value = parsed.explanation ?? parsed.summary ?? parsed.text;
      if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
    } catch {
      return trimmed.replace(/\s+/g, ' ');
    }
  }
  return trimmed.replace(/\s+/g, ' ').trim();
}

function parseModelJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart === -1 || objectEnd === -1) throw new Error('no json object');
  return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
}
