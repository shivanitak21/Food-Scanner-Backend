import mongoose from 'mongoose';

import { Scan } from '../models/Scan';
import type { AnalysisStatus } from '../rules/types';
import { normalizeCountryCode } from '../rules/countries';
import { logger } from '../config/logger';
import { AppError, NotFoundError } from '../utils/errors';
import { aiService, analysisService } from './analysisService';
import { familyHeadline, type FamilyScanBody } from './presentAnalysis';
import { nutritionFromLabelItems, type LabelNutrientInput } from './nutrition';

export interface CaptureDraft {
  productName: string;
  brand: string;
  variant: string;
  category: string;
  claims: string[];
  ingredientsText: string;
  contains: string[];
  mayContain: string[];
  nutrition: LabelNutrientInput[];
  sections: {
    package: 'ready' | 'missing';
    ingredients: 'ready' | 'missing';
    nutrition: 'ready' | 'missing';
    allergens: 'ready' | 'missing';
  };
  nextCapture: 'ingredients' | 'nutrition' | null;
  prompt: { title: string; message: string } | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NEEDS_CONFIRMATION';
  verificationStatus: 'NEEDS_REVIEW';
}
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

  async previewLabel(images: Array<{ buffer: Buffer; mimeType: string }>): Promise<CaptureDraft> {
    if (images.length === 0) throw new AppError('Add at least one package photo.', 400, 'VALIDATION_ERROR');
    const parts = [];
    for (const image of images.slice(0, 3)) {
      parts.push(await aiService.extractLabel(image.buffer, image.mimeType, { allowPartial: true }));
    }
    const named = parts.filter((part) => part.productName && part.productName !== 'Scanned label');
    const useful = parts.filter(
      (part) => part.ingredientsText || part.nutritionItems.length > 0 || part.contains.length > 0 || named.includes(part),
    );
    if (useful.length === 0 && named.length === 0) {
      throw new AppError(
        "We couldn't read the package. Move closer, keep it steady, and try another angle.",
        422,
        'LABEL_UNREADABLE',
      );
    }
    const pool = useful.length > 0 ? useful : named;
    const ingredientsText = normalizeIngredientText(pool.map((part) => part.ingredientsText).filter(Boolean).join(', '));
    const contains = unique(pool.flatMap((part) => part.contains));
    const mayContain = unique(pool.flatMap((part) => part.mayContain));
    const nutrition: LabelNutrientInput[] = pool.flatMap((part) =>
      part.nutritionItems.map((item) => ({ name: item.name, amount: item.amount, unit: item.unit })),
    );
    const productName = named[0]?.productName ?? pool.find((part) => part.productName)?.productName ?? '';
    const sections = {
      package: productName ? ('ready' as const) : ('missing' as const),
      ingredients: ingredientsText.length > 0 || contains.length > 0 ? ('ready' as const) : ('missing' as const),
      nutrition: nutrition.length > 0 ? ('ready' as const) : ('missing' as const),
      allergens: contains.length + mayContain.length > 0 ? ('ready' as const) : ('missing' as const),
    };
    const nextCapture: CaptureDraft['nextCapture'] =
      sections.ingredients === 'missing' ? 'ingredients' : sections.nutrition === 'missing' ? 'nutrition' : null;
    const prompt =
      nextCapture === 'ingredients'
        ? {
            title: productName ? 'We found the product.' : 'Almost there.',
            message: 'Turn the package around so we can read the ingredients.',
          }
        : nextCapture === 'nutrition'
          ? {
              title: 'One more thing.',
              message: 'Capture the nutrition panel.',
            }
          : null;
    return {
      productName,
      brand: pool.find((part) => part.brand)?.brand ?? '',
      variant: pool.find((part) => part.variant)?.variant ?? '',
      category: pool.find((part) => part.category)?.category ?? '',
      claims: unique(pool.flatMap((part) => part.claims)),
      ingredientsText,
      contains,
      mayContain,
      nutrition,
      sections,
      nextCapture,
      prompt,
      confidence: sections.ingredients === 'ready' && sections.nutrition === 'ready' ? 'NEEDS_CONFIRMATION' : 'LOW',
      verificationStatus: 'NEEDS_REVIEW',
    };
  }

  async confirmLabel(
    userId: string,
    input: {
      productName: string;
      brand?: string;
      variant?: string;
      category?: string;
      claims?: string[];
      barcode?: string;
      ingredientsText: string;
      contains: string[];
      mayContain: string[];
      nutrition: LabelNutrientInput[];
      country?: string;
      image?: { buffer: Buffer; mimeType: string };
    },
  ): Promise<FamilyScanBody> {
    const profiles = await this.profiles(userId);
    const country = input.country ? normalizeCountryCode(input.country) ?? undefined : undefined;
    const nutrition = nutritionFromLabelItems(input.nutrition);
    const product = await productService.saveLabel({
      name: input.productName,
      brand: input.brand || undefined,
      variant: input.variant || undefined,
      category: input.category || undefined,
      claims: input.claims ?? [],
      barcode: input.barcode,
      ingredientsText: normalizeIngredientText(input.ingredientsText),
      contains: input.contains,
      mayContain: input.mayContain,
      nutrition: nutrition.facts,
      nutritionItems: nutrition.items,
      countryCode: country,
      confidence: input.ingredientsText.trim() ? 'HIGH' : 'LOW',
      image: input.image,
    });
    const draft = await analysisService.buildFamily({
      profiles,
      product,
      scanType: 'label',
      countryHint: country,
      labelConfirmed: true,
    });
    return this.persist(userId, profiles, product.id, 'label', draft);
  }

  async refreshMember(userId: string, profileId: string): Promise<void> {
    const profiles = await profileService.list(userId);
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;
    const scans = await Scan.find({ userId }).sort({ createdAt: -1 }).limit(20);
    for (const scan of scans) {
      if (!scan.productId) continue;
      try {
        const product = await productService.findByIdOrBarcode(String(scan.productId));
        const reviewed = await analysisService.reviewProfile({
          profile,
          product,
          scanType: scan.scanType === 'label' ? 'label' : 'barcode',
        });
        const analysis = (scan.analysis ?? {}) as FamilyScanBody;
        const analyses = Array.isArray(analysis.profileAnalyses) ? [...analysis.profileAnalyses] : [];
        const index = analyses.findIndex((item) => item.profileId === profileId);
        if (index >= 0) analyses[index] = reviewed;
        else analyses.push(reviewed);
        const familySummary = analyses.map((item) => {
          const headline = item.fit === 'GOOD_FIT' ? 'Good fit' : familyHeadline(item.status, item.findings);
          return {
            profileId: item.profileId,
            profileName: item.profileName,
            status: item.status,
            fit: item.fit,
            statusLabel: item.statusLabel,
            headline,
            topConcern: item.fit === 'GOOD_FIT' ? null : headline,
          };
        });
        scan.analysis = { ...analysis, scope: 'family', profileAnalyses: analyses, familySummary };
        scan.status = worstStatus(familySummary.map((member) => member.status));
        scan.markModified('analysis');
        await scan.save();
      } catch (error) {
        logger.warn({ message: error instanceof Error ? error.message : 'refresh failed', profileId }, 'profile review refresh skipped');
      }
    }
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
