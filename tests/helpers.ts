import { tagIngredientName } from '../src/rules/dictionaries';
import type { RulesInput, TaggedIngredient } from '../src/rules/types';

export function tagged(raw: string): TaggedIngredient {
  return { raw, name: raw, tags: tagIngredientName(raw) };
}

export function rulesInput(overrides: Partial<RulesInput> = {}): RulesInput {
  return {
    profile: {
      name: 'Aria',
      ageGroup: 'adult',
      age: 30,
      diet: 'none',
      dietaryPreferences: [],
      allergies: [],
      limits: [],
      ...overrides.profile,
    },
    ingredients: overrides.ingredients ?? [tagged('water'), tagged('salt')],
    declarations: overrides.declarations ?? [],
    nutrition: overrides.nutrition ?? null,
    countryCodes: overrides.countryCodes ?? ['US'],
    sourceReliability: overrides.sourceReliability ?? 'database',
    organicClaim: overrides.organicClaim ?? null,
    staleProductData: overrides.staleProductData ?? false,
  };
}
