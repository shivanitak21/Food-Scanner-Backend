import axios, { type AxiosInstance } from 'axios';
import mongoose from 'mongoose';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { Product } from '../models/Product';
import { normalizeCountryCode } from '../rules/countries';
import type { AllergenDeclaration, NutritionFacts } from '../rules/types';
import { AppError, NotFoundError, isMongoDuplicate } from '../utils/errors';
import { prepareIngredients } from './ingredientService';
import type { NutritionItem } from './nutrition';
import { fetchOpenFoodFactsProduct, type OffDraft } from './openFoodFacts';

export interface StoredProduct {
  id: string;
  barcode?: string;
  name: string;
  brand?: string;
  countryCodes: string[];
  ingredientsText: string;
  declarations: AllergenDeclaration[];
  nutrition: NutritionFacts | null;
  nutritionItems: NutritionItem[];
  imageUrl?: string;
  organicClaim: boolean | null;
  source: 'open_food_facts' | 'label_ocr';
  sourceUpdatedAt?: string;
  fetchedAt: string;
  freshness: 'fresh' | 'cached' | 'stale';
}

interface ProductRecord {
  _id: mongoose.Types.ObjectId;
  barcode?: string;
  name: string;
  brand?: string;
  countryCodes?: string[];
  ingredientsText?: string;
  declarations?: AllergenDeclaration[];
  nutrition?: NutritionFacts | null;
  nutritionItems?: NutritionItem[];
  imageUrl?: string;
  organicClaim?: boolean | null;
  source: 'open_food_facts' | 'label_ocr';
  sourceUpdatedAt?: Date;
  fetchedAt: Date;
}

export class ProductService {
  constructor(private readonly http: AxiosInstance) {}

  async findByBarcode(barcode: string, countryHint?: string): Promise<StoredProduct> {
    const cached = await Product.findOne({ barcode }).lean<ProductRecord | null>();
    const fresh = cached ? Date.now() - new Date(cached.fetchedAt).getTime() < env.productCacheTtlMs : false;
    if (cached && fresh) return toStored(cached, 'cached');

    try {
      const remote = await fetchOpenFoodFactsProduct(this.http, barcode, env.openFoodFactsUserAgent);
      if (!remote) {
        if (cached) return toStored(cached, 'stale');
        throw new AppError(
          'We found the barcode, but this product is not in the product database.',
          404,
          'PRODUCT_NOT_FOUND',
        );
      }
      if (countryHint) remote.countryCodes = [...new Set([...remote.countryCodes, countryHint])];
      const saved = await this.upsertBarcode(remote);
      return toStored(saved, 'fresh');
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AppError) throw error;
      logger.warn({ message: error instanceof Error ? error.message : 'lookup failed', barcode }, 'product lookup failed');
      if (cached) return toStored(cached, 'stale');
      throw new AppError('The product database could not be reached. Try again in a moment.', 502, 'PRODUCT_SOURCE');
    }
  }

  async findByIdOrBarcode(idOrBarcode: string): Promise<StoredProduct> {
    const query = mongoose.isValidObjectId(idOrBarcode)
      ? { $or: [{ _id: idOrBarcode }, { barcode: idOrBarcode }] }
      : { barcode: idOrBarcode };
    const product = await Product.findOne(query).lean<ProductRecord | null>();
    if (!product) throw new NotFoundError('Product not found.');
    const fresh = Date.now() - new Date(product.fetchedAt).getTime() < env.productCacheTtlMs;
    return toStored(product, fresh ? 'cached' : 'stale');
  }

  async saveLabel(input: {
    name: string;
    brand?: string;
    ingredientsText: string;
    contains: string[];
    mayContain: string[];
    nutrition: NutritionFacts | null;
    nutritionItems: NutritionItem[];
    countryCode?: string;
  }): Promise<StoredProduct> {
    const ingredientsText = [input.ingredientsText, input.contains.length > 0 ? `Contains: ${input.contains.join(', ')}.` : '', input.mayContain.length > 0 ? `May contain: ${input.mayContain.join(', ')}.` : '']
      .filter(Boolean)
      .join(' ')
      .slice(0, 20000);
    const prepared = prepareIngredients(ingredientsText, { source: 'Label photo' });
    const created = await Product.create({
      name: input.name,
      brand: input.brand || undefined,
      countryCodes: input.countryCode ? [input.countryCode] : [],
      ingredientsText,
      declarations: prepared.declarations,
      nutrition: input.nutrition,
      nutritionItems: input.nutritionItems,
      organicClaim: null,
      source: 'label_ocr',
      sourceUpdatedAt: new Date(),
      fetchedAt: new Date(),
    });
    return toStored(created.toObject() as ProductRecord, 'fresh');
  }

  private async upsertBarcode(draft: OffDraft): Promise<ProductRecord> {
    const update = {
      name: draft.name,
      brand: draft.brand,
      countryCodes: draft.countryCodes,
      ingredientsText: draft.ingredientsText,
      declarations: draft.declarations,
      nutrition: draft.nutrition,
      nutritionItems: draft.nutritionItems,
      imageUrl: draft.imageUrl,
      organicClaim: draft.organicClaim,
      source: 'open_food_facts' as const,
      sourceUpdatedAt: draft.sourceUpdatedAt,
      fetchedAt: new Date(),
    };
    try {
      const saved = await Product.findOneAndUpdate({ barcode: draft.barcode }, { $set: update, $setOnInsert: { barcode: draft.barcode } }, { upsert: true, new: true }).lean<ProductRecord | null>();
      if (!saved) throw new AppError('The product could not be saved.', 500, 'PRODUCT_SAVE');
      return saved;
    } catch (error) {
      if (!isMongoDuplicate(error)) throw error;
      const existing = await Product.findOne({ barcode: draft.barcode }).lean<ProductRecord | null>();
      if (!existing) throw error;
      return existing;
    }
  }
}

function toStored(product: ProductRecord, freshness: StoredProduct['freshness']): StoredProduct {
  return {
    id: String(product._id),
    barcode: product.barcode || undefined,
    name: product.name,
    brand: product.brand || undefined,
    countryCodes: (product.countryCodes ?? []).map((code) => normalizeCountryCode(code)).filter((code): code is string => Boolean(code)),
    ingredientsText: product.ingredientsText ?? '',
    declarations: product.declarations ?? [],
    nutrition: product.nutrition ?? null,
    nutritionItems: product.nutritionItems ?? [],
    imageUrl: product.imageUrl || undefined,
    organicClaim: typeof product.organicClaim === 'boolean' ? product.organicClaim : null,
    source: product.source,
    sourceUpdatedAt: product.sourceUpdatedAt ? new Date(product.sourceUpdatedAt).toISOString() : undefined,
    fetchedAt: new Date(product.fetchedAt).toISOString(),
    freshness,
  };
}

export const productService = new ProductService(
  axios.create({
    baseURL: env.openFoodFactsBaseUrl,
    timeout: 12000,
  }),
);
