import type { AxiosInstance } from 'axios';

import { normalizeCountryCode } from '../rules/countries';
import { prepareIngredients } from './ingredientService';
import { displayNutrition } from './nutrition';
import type { NutritionItem } from './nutrition';
import type { AllergenDeclaration, NutritionFacts } from '../rules/types';

export interface OffDraft {
  barcode: string;
  name: string;
  brand?: string;
  countryCodes: string[];
  ingredientsText: string;
  declarations: AllergenDeclaration[];
  nutrition: NutritionFacts | null;
  nutritionItems: NutritionItem[];
  imageUrl?: string;
  organicClaim: boolean;
  sourceUpdatedAt?: Date;
}

const OFF_ALLERGENS: Record<string, string> = {
  'en:milk': 'milk',
  'en:eggs': 'egg',
  'en:gluten': 'gluten',
  'en:soybeans': 'soy',
  'en:nuts': 'tree_nut',
  'en:peanuts': 'peanut',
  'en:fish': 'fish',
  'en:crustaceans': 'crustacean_shellfish',
  'en:molluscs': 'mollusc',
  'en:celery': 'celery',
  'en:mustard': 'mustard',
  'en:sesame-seeds': 'sesame',
  'en:sulphur-dioxide-and-sulphites': 'sulphite',
  'en:lupin': 'lupin',
  'en:wheat': 'wheat',
};

export async function fetchOpenFoodFactsProduct(
  http: AxiosInstance,
  barcode: string,
  userAgent: string,
): Promise<OffDraft | null> {
  const response = await http.get(`/api/v2/product/${encodeURIComponent(barcode)}.json`, {
    headers: { 'User-Agent': userAgent },
    validateStatus: (status) => status === 200 || status === 404,
  });
  if (response.status === 404) return null;
  return mapOffProduct(barcode, response.data);
}

export function mapOffProduct(barcode: string, payload: unknown): OffDraft | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as { status?: number; product?: Record<string, unknown> };
  if (body.status === 0 || !body.product) return null;
  const product = body.product;
  const ingredientsText = stringField(product, 'ingredients_text') || stringField(product, 'ingredients_text_en');
  const prepared = prepareIngredients(ingredientsText, { source: 'Open Food Facts' });
  const declarations = mergeDeclarations(
    prepared.declarations,
    declarationsFromTags(arrayField(product, 'allergens_tags'), 'detected', 'Open Food Facts allergen tag'),
    declarationsFromTags(arrayField(product, 'traces_tags'), 'may_contain', 'Open Food Facts trace tag'),
  );
  const countryCodes = countryCodesFrom(product);
  const nutrition = nutritionFromOff(product.nutriments);
  const brands = stringField(product, 'brands');
  const modified = numberField(product, 'last_modified_t');

  return {
    barcode,
    name: stringField(product, 'product_name') || stringField(product, 'product_name_en') || 'Unknown product',
    brand: brands ? brands.split(',')[0]?.trim() : undefined,
    countryCodes,
    ingredientsText,
    declarations,
    nutrition,
    nutritionItems: displayNutrition(nutrition, countryCodes),
    imageUrl: stringField(product, 'image_front_url') || stringField(product, 'image_url') || undefined,
    organicClaim: arrayField(product, 'labels_tags').some((tag) => tag.includes('organic')),
    sourceUpdatedAt: modified ? new Date(modified * 1000) : undefined,
  };
}

function nutritionFromOff(value: unknown): NutritionFacts | null {
  if (!value || typeof value !== 'object') return null;
  const nutriments = value as Record<string, unknown>;
  const per100g = readBasis(nutriments, '100g');
  const perServing = readBasis(nutriments, 'serving');
  const servingSize = stringFromUnknown(nutriments.serving_size);
  const facts: NutritionFacts = {};
  if (per100g) facts.per100g = per100g;
  if (perServing || servingSize) facts.perServing = { ...perServing, servingSize };
  if (!facts.per100g && !hasServingNumbers(facts.perServing)) return facts.perServing?.servingSize ? facts : null;
  return facts;
}

function readBasis(nutriments: Record<string, unknown>, suffix: '100g' | 'serving') {
  const energy = numberField(nutriments, `energy-kcal_${suffix}`);
  const fat = numberField(nutriments, `fat_${suffix}`);
  const saturatedFat = numberField(nutriments, `saturated-fat_${suffix}`);
  const carbohydrates = numberField(nutriments, `carbohydrates_${suffix}`);
  const sugars = numberField(nutriments, `sugars_${suffix}`);
  const protein = numberField(nutriments, `proteins_${suffix}`);
  const salt = numberField(nutriments, `salt_${suffix}`);
  const sodium = numberField(nutriments, `sodium_${suffix}`);
  const amount = {
    energyKcal: energy,
    fatG: fat,
    saturatedFatG: saturatedFat,
    carbohydratesG: carbohydrates,
    sugarsG: sugars,
    proteinG: protein,
    saltG: salt,
    sodiumMg: sodium !== undefined ? Math.round(sodium * 1000) : salt !== undefined ? Math.round(salt * 400) : undefined,
  };
  return Object.values(amount).some((item) => item !== undefined) ? amount : undefined;
}

function hasServingNumbers(serving: NutritionFacts['perServing']): boolean {
  if (!serving) return false;
  return ['energyKcal', 'fatG', 'saturatedFatG', 'carbohydratesG', 'sugarsG', 'proteinG', 'saltG', 'sodiumMg'].some(
    (key) => typeof serving[key as keyof typeof serving] === 'number',
  );
}

function declarationsFromTags(tags: string[], presence: 'detected' | 'may_contain', source: string): AllergenDeclaration[] {
  const declarations: AllergenDeclaration[] = [];
  for (const tag of tags) {
    const allergenId = OFF_ALLERGENS[tag.toLowerCase()];
    if (!allergenId) continue;
    declarations.push({ allergenId, label: tag.replace(/^en:/, '').replace(/-/g, ' '), presence, source });
  }
  return declarations;
}

function mergeDeclarations(...groups: AllergenDeclaration[][]): AllergenDeclaration[] {
  const seen = new Set<string>();
  const merged: AllergenDeclaration[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = `${item.allergenId}:${item.presence}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

function countryCodesFrom(product: Record<string, unknown>): string[] {
  const tags = arrayField(product, 'countries_tags');
  const names = stringField(product, 'countries')
    .split(',')
    .map((part) => part.trim());
  const codes = [...tags, ...names].map((value) => normalizeCountryCode(value)).filter((code): code is string => Boolean(code));
  return [...new Set(codes)];
}

function arrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function stringField(record: Record<string, unknown>, key: string): string {
  return stringFromUnknown(record[key]);
}

function stringFromUnknown(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
