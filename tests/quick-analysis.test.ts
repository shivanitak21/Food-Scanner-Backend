import { describe, expect, it } from 'vitest';

import { assessProduct } from '../src/rules/assessment';
import { contextFromProfile, normalizeContext, profileFromContext, resolvedAge } from '../src/rules/context';
import { analyzeProfile } from '../src/rules/engine';
import { buildQuickAnalysis } from '../src/services/foodAnalysis';
import type { StoredProduct } from '../src/services/productService';
import { rulesInput, tagged } from './helpers';

function product(overrides: Partial<StoredProduct> = {}): StoredProduct {
  return {
    id: 'product-1',
    name: 'Sample crackers',
    countryCodes: ['GB'],
    ingredientsText: 'wheat flour, salt, milk powder, sugar',
    declarations: [],
    nutrition: {
      per100g: {
        energyKcal: 480,
        proteinG: 8,
        carbohydratesG: 60,
        sugarsG: 28,
        fiberG: 1.2,
        sodiumMg: 900,
        saturatedFatG: 7,
        fatG: 18,
      },
    },
    nutritionItems: [],
    organicClaim: null,
    source: 'open_food_facts',
    fetchedAt: new Date().toISOString(),
    freshness: 'fresh',
    ...overrides,
  };
}

describe('quick analysis', () => {
  it('gives a generic nutrition check when no context is provided', () => {
    const result = buildQuickAnalysis({ product: product(), scanType: 'barcode' });
    const text = JSON.stringify(result);

    expect(result.scope).toBe('quick');
    expect(result.overall).toBe('limit');
    expect(result.overallLabel).toBe('Limit');
    expect(result.whatToKnow).toEqual(expect.arrayContaining(['High sodium', 'High sugar', 'Low fiber']));
    expect(result.whoMayWantToCheck).toEqual(expect.arrayContaining(['People watching sodium', 'People avoiding dairy']));
    expect(result.contextNotes).toEqual([]);
    expect(result.professionalNote).toBeNull();
    expect(text).not.toMatch(/unsafe for diabetes|diagnosis of/i);
    expect(result.highlights.find((item) => item.id === 'sodium')).toMatchObject({ level: 'high', emphasized: false });
  });

  it('emphasizes sugar for a blood-sugar context without a diagnosis', () => {
    const result = buildQuickAnalysis({
      product: product(),
      scanType: 'barcode',
      context: { healthConditions: ['diabetes'] },
    });
    const sugar = result.highlights.find((item) => item.id === 'sugar');
    const sodium = result.highlights.find((item) => item.id === 'sodium');

    expect(sugar?.emphasized).toBe(true);
    expect(result.contextNotes).toContain("Relevant if you're watching blood sugar.");
    expect(result.professionalNote).toMatch(/healthcare professional/i);
    expect(JSON.stringify(result.contextNotes)).not.toMatch(/unsafe|not suitable for diabetes/i);
    expect(sodium?.emphasized).toBe(false);
    expect(result.profileDraft.limits).toContain('Added sugar');
    expect(result.profileDraft.notes).toMatch(/watching blood sugar/i);
  });

  it('emphasizes sodium only when blood pressure is selected', () => {
    const result = buildQuickAnalysis({
      product: product(),
      scanType: 'barcode',
      context: { healthConditions: ['high_blood_pressure'] },
    });

    expect(result.highlights.find((item) => item.id === 'sodium')?.emphasized).toBe(true);
    expect(result.contextNotes).toContain("Relevant if you're monitoring sodium.");
    expect(result.contextNotes.join(' ')).not.toMatch(/blood sugar|saturated fat/i);
  });

  it('derives age emphasis from a date of birth without naming an age group', () => {
    const today = new Date();
    const dob = `${today.getFullYear() - 8}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const context = normalizeContext({ dateOfBirth: dob });
    const result = buildQuickAnalysis({ product: product(), scanType: 'barcode', context });

    expect(resolvedAge(context, today)).toBe(8);
    expect(result.context.age).toBe(8);
    expect(result.contextNotes.join(' ')).toMatch(/for this age/i);
    expect(result.contextNotes.join(' ')).toMatch(/sugar/);
    expect(result.contextNotes.join(' ')).not.toMatch(/\b(child|children|adults|senior)\b/i);
    expect(result.profileDraft.lifeStage).toBe('child');
    expect(result.profileDraft.dateOfBirth).toBe(dob);
  });

  it('returns not enough information when the product has no nutrition or ingredients', () => {
    const result = buildQuickAnalysis({
      product: product({ ingredientsText: '', nutrition: null }),
      scanType: 'barcode',
    });

    expect(result.overall).toBe('insufficient');
    expect(result.overallLabel).toBe('Not enough information');
  });

  it('keeps a saved profile mapped through the same context layer', () => {
    const mapped = profileFromContext(
      contextFromProfile({
        name: 'Aria',
        age: 6,
        dateOfBirth: null,
        ageGroup: 'child',
        diet: 'none',
        dietaryPreferences: ['Halal'],
        allergies: ['Milk'],
        limits: ['Added sugar'],
        goals: ['Manage sugar'],
        lifeStage: 'child',
      }),
    );

    expect(mapped).toMatchObject({
      name: 'Aria',
      age: 6,
      ageGroup: 'child',
      allergies: ['Milk'],
      limits: ['Added sugar'],
      goals: ['Manage sugar'],
      lifeStage: 'child',
    });
  });

  it('does not mention a health condition that was not provided', () => {
    const input = rulesInput({
      profile: profileFromContext(normalizeContext()),
      ingredients: [tagged('oats'), tagged('milk')],
      nutrition: { per100g: { sugarsG: 2, sodiumMg: 40, saturatedFatG: 0.4, proteinG: 10, fiberG: 8, energyKcal: 120, carbohydratesG: 20 } },
    });
    const rules = analyzeProfile(input);
    const assessment = assessProduct({
      ingredients: input.ingredients,
      declarations: [],
      nutrition: input.nutrition,
      rules,
      context: normalizeContext(),
    });

    expect(assessment.overall).toBe('good');
    expect(assessment.contextNotes).toEqual([]);
    expect(assessment.professionalNote).toBeNull();
    expect(assessment.whoMayWantToCheck).toContain('People avoiding dairy');
  });
});
