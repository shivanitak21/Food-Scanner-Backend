import mongoose from 'mongoose';

import { Scan } from '../models/Scan';
import type { AnalysisStatus } from '../rules/types';
import { normalizeCountryCode } from '../rules/countries';
import { AppError, NotFoundError } from '../utils/errors';
import { aiService, analysisService } from './analysisService';
import type { FamilyScanBody } from './presentAnalysis';
import { nutritionFromLabelItems, type LabelNutrientInput } from './nutrition';
import { normalizeIngredientText } from './ocrNormalize';
import { productService } from './productService';
import { profileService } from './profileService';

export class ScanService {
  async barcode(userId: string, input: { barcode: string; country?: string }): Promise<FamilyScanBody> {
    const profiles = await this.profiles(userId);
    const country = input.country ? normalizeCountryCode(input.country) ?? undefined : undefined;
    const product = await productService.findByBarcode(input.barcode, country);
    const draft = await analysisService.buildFamily({ profiles, product, scanType: 'barcode', countryHint: country });
    return this.persist(userId, profiles, product.id, 'barcode', draft);
  }

  async label(
    userId: string,
    input: { country?: string; image: Buffer; mimeType: string },
  ): Promise<FamilyScanBody> {
    const profiles = await this.profiles(userId);
    const country = input.country ? normalizeCountryCode(input.country) ?? undefined : undefined;
    const extraction = await aiService.extractLabel(input.image, input.mimeType);
    const product = await productService.saveLabel({
      name: extraction.productName,
      brand: extraction.brand || undefined,
      ingredientsText: extraction.ingredientsText,
      contains: extraction.contains,
      mayContain: extraction.mayContain,
      nutrition: extraction.nutrition,
      nutritionItems: extraction.nutritionItems,
      countryCode: country,
    });
    const draft = await analysisService.buildFamily({ profiles, product, scanType: 'label', countryHint: country });
    return this.persist(userId, profiles, product.id, 'label', draft);
  }

  async previewLabel(images: Array<{ buffer: Buffer; mimeType: string }>): Promise<{
    productName: string;
    brand: string;
    ingredientsText: string;
    contains: string[];
    mayContain: string[];
    nutrition: LabelNutrientInput[];
    sections: { ingredients: 'ready' | 'missing'; nutrition: 'ready' | 'missing'; allergens: 'ready' | 'missing' };
    verificationStatus: 'NEEDS_REVIEW';
  }> {
    if (images.length === 0) throw new AppError('Add at least one label photo.', 400, 'VALIDATION_ERROR');
    const parts = [];
    for (const image of images.slice(0, 3)) {
      parts.push(await aiService.extractLabel(image.buffer, image.mimeType, { allowPartial: true }));
    }
    const useful = parts.filter((part) => part.ingredientsText || part.nutritionItems.length > 0 || part.contains.length > 0);
    if (useful.length === 0) {
      throw new AppError(
        'The label could not be read. Retake it in even light, with the text filling the frame.',
        422,
        'LABEL_UNREADABLE',
      );
    }
    const ingredientsText = normalizeIngredientText(useful.map((part) => part.ingredientsText).filter(Boolean).join(', '));
    const contains = unique(useful.flatMap((part) => part.contains));
    const mayContain = unique(useful.flatMap((part) => part.mayContain));
    const nutritionItems = useful.flatMap((part) => part.nutritionItems);
    const nutrition: LabelNutrientInput[] = nutritionItems.map((item) => ({
      name: item.name,
      amount: item.amount,
      unit: item.unit,
    }));
    return {
      productName: useful.find((part) => part.productName && part.productName !== 'Scanned label')?.productName ?? useful[0]?.productName ?? '',
      brand: useful.find((part) => part.brand)?.brand ?? '',
      ingredientsText,
      contains,
      mayContain,
      nutrition,
      sections: {
        ingredients: ingredientsText.length > 0 ? 'ready' : 'missing',
        nutrition: nutrition.length > 0 ? 'ready' : 'missing',
        allergens: contains.length + mayContain.length > 0 ? 'ready' : 'missing',
      },
      verificationStatus: 'NEEDS_REVIEW',
    };
  }

  async confirmLabel(
    userId: string,
    input: {
      productName: string;
      brand?: string;
      ingredientsText: string;
      contains: string[];
      mayContain: string[];
      nutrition: LabelNutrientInput[];
      country?: string;
    },
  ): Promise<FamilyScanBody> {
    const profiles = await this.profiles(userId);
    const country = input.country ? normalizeCountryCode(input.country) ?? undefined : undefined;
    const nutrition = nutritionFromLabelItems(input.nutrition);
    const product = await productService.saveLabel({
      name: input.productName,
      brand: input.brand || undefined,
      ingredientsText: normalizeIngredientText(input.ingredientsText),
      contains: input.contains,
      mayContain: input.mayContain,
      nutrition: nutrition.facts,
      nutritionItems: nutrition.items,
      countryCode: country,
    });
    const draft = await analysisService.buildFamily({ profiles, product, scanType: 'label', countryHint: country });
    return this.persist(userId, profiles, product.id, 'label', draft);
  }

  async history(userId: string): Promise<Array<FamilyScanBody | Record<string, unknown>>> {
    const scans = await Scan.find({ userId }).sort({ createdAt: -1 }).limit(100);
    return scans.map(withIdentity);
  }

  async get(userId: string, scanId: string): Promise<FamilyScanBody | Record<string, unknown>> {
    if (!mongoose.isValidObjectId(scanId)) throw new NotFoundError('Scan not found.');
    const scan = await Scan.findOne({ _id: scanId, userId });
    if (!scan) throw new NotFoundError('Scan not found.');
    return withIdentity(scan);
  }

  private async profiles(userId: string) {
    const profiles = await profileService.list(userId);
    if (profiles.length === 0) {
      throw new AppError('Add a family profile before scanning.', 400, 'VALIDATION_ERROR');
    }
    return profiles;
  }

  private async persist(
    userId: string,
    profiles: Array<{ id: string; isPrimary: boolean }>,
    productId: string,
    scanType: 'barcode' | 'label',
    draft: Omit<FamilyScanBody, 'id' | 'createdAt'>,
  ): Promise<FamilyScanBody> {
    const anchor = profiles.find((profile) => profile.isPrimary) ?? profiles[0];
    const scan = new Scan({
      userId,
      profileId: anchor.id,
      productId,
      scanType,
      status: worstStatus(draft.familySummary.map((member) => member.status)),
      analysis: draft,
    });
    await scan.save();
    const analysis = withIdentity(scan) as FamilyScanBody;
    scan.analysis = analysis;
    scan.markModified('analysis');
    await scan.save();
    return analysis;
  }
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function worstStatus(statuses: AnalysisStatus[]): AnalysisStatus {
  if (statuses.includes('avoid')) return 'avoid';
  if (statuses.includes('review')) return 'review';
  return 'suitable';
}

function withIdentity(scan: { _id: mongoose.Types.ObjectId; createdAt?: Date; analysis: unknown }): FamilyScanBody | Record<string, unknown> {
  const analysis = (scan.analysis ?? {}) as Record<string, unknown>;
  return {
    ...analysis,
    id: String(scan._id),
    createdAt: (scan.createdAt ?? new Date()).toISOString(),
  };
}

export const scanService = new ScanService();
