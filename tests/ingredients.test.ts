import { describe, expect, it } from 'vitest';

import { tagIngredientName } from '../src/rules/dictionaries';
import { prepareIngredients, separateLabelSections } from '../src/services/ingredientService';

describe('ingredient normalization', () => {
  it('splits on commas while keeping parenthetical ingredients together', () => {
    const prepared = prepareIngredients(
      'Ingredients: sugar, palm oil, skimmed milk powder (milk), emulsifier (soy lecithin). Contains: milk. May contain: nuts.',
    );

    expect(prepared.ingredients.map((item) => item.name)).toEqual([
      'sugar',
      'palm oil',
      'skimmed milk powder (milk)',
      'emulsifier (soy lecithin)',
      'milk',
    ]);
    expect(prepared.declarations.some((item) => item.allergenId === 'tree_nut' && item.presence === 'may_contain')).toBe(true);
    expect(prepared.ingredients.find((item) => item.name.includes('milk powder'))?.tags.some((tag) => tag.id === 'milk')).toBe(true);
    expect(prepared.ingredients.find((item) => item.name.includes('lecithin'))?.tags.some((tag) => tag.id === 'soy')).toBe(true);
  });

  it('does not treat rice flour as wheat', () => {
    const tags = tagIngredientName('rice flour');
    expect(tags.some((tag) => tag.id === 'wheat')).toBe(false);
  });

  it('keeps the allergen statement out of the ingredient sentence', () => {
    const sections = separateLabelSections('Sugar, salt. May contain: sesame.');
    expect(sections.ingredientText.toLowerCase()).not.toMatch(/may contain/);
    expect(sections.mayContain).toEqual(['sesame']);
  });
});
