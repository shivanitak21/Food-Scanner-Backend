import { describe, expect, it } from 'vitest';

import { explanationIsUsable } from '../src/ai/explanationGuard';
import { mapOffProduct } from '../src/services/openFoodFacts';

describe('explanation guard', () => {
  it('accepts a rewrite that keeps the high-severity ingredient and the diagnosis limit', () => {
    const text = 'For Aria, whey is listed and matches a milk allergy. This is not a medical diagnosis.';
    expect(explanationIsUsable(text, ['whey'])).toBe(true);
  });

  it('rejects a rewrite that calls the product safe or drops the ingredient', () => {
    expect(explanationIsUsable('This food is safe for your allergy and is not a medical diagnosis.', ['whey'])).toBe(false);
    expect(explanationIsUsable('No concerns were found. This is not a medical diagnosis.', ['whey'])).toBe(false);
  });
});

describe('Open Food Facts mapping', () => {
  it('keeps country codes and converts sodium grams to milligrams', () => {
    const mapped = mapOffProduct('8901234567890', {
      status: 1,
      product: {
        product_name: 'Masala chips',
        brands: 'Example Foods',
        countries_tags: ['en:india', 'en:united-states'],
        ingredients_text: 'Potato, sunflower oil, salt, spices',
        allergens_tags: [],
        traces_tags: ['en:peanuts'],
        nutriments: { sodium_100g: 0.8, sugars_100g: 2 },
        labels_tags: ['en:organic'],
        last_modified_t: 1_700_000_000,
      },
    });

    expect(mapped?.countryCodes).toEqual(['IN', 'US']);
    expect(mapped?.nutrition?.per100g?.sodiumMg).toBe(800);
    expect(mapped?.declarations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ allergenId: 'peanut', presence: 'may_contain' }),
      ]),
    );
    expect(mapped?.organicClaim).toBe(true);
    expect(mapped?.nutritionItems.find((item) => item.name === 'Sodium')?.amount).toBe('800');
  });
});
