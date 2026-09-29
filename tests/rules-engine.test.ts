import { describe, expect, it } from 'vitest';

import { analyzeProfile } from '../src/rules/engine';
import { buildSummary } from '../src/services/summary';
import { rulesInput, tagged } from './helpers';

function summarize(input: ReturnType<typeof rulesInput>, result: ReturnType<typeof analyzeProfile>) {
  return buildSummary({
    profileName: input.profile.name,
    productName: 'Test cereal',
    status: result.status,
    findings: result.findings,
    clearChecks: result.clearChecks,
    sourceLabel: 'Open Food Facts',
  });
}

describe('rules engine', () => {
  it('matches whey to a milk allergy as a detected high-severity finding', () => {
    const input = rulesInput({
      profile: { name: 'Aria', ageGroup: 'child', age: 6, diet: 'none', dietaryPreferences: [], allergies: ['Milk'], limits: [] },
      ingredients: [tagged('sugar'), tagged('whey'), tagged('cocoa')],
    });
    const result = analyzeProfile(input);
    const milk = result.findings.find((finding) => finding.type === 'ALLERGEN');

    expect(result.status).toBe('avoid');
    expect(milk).toMatchObject({ severity: 'HIGH', detection: 'detected', ingredient: 'whey' });
    expect(milk?.reason).toMatch(/whey/i);
    expect(milk?.reason).not.toMatch(/medically safe|bad for your body|allergy-free/i);
    expect(summarize(input, result)).toMatch(/not a medical diagnosis/i);
  });

  it('keeps a may-contain milk warning at review and does not call it detected', () => {
    const result = analyzeProfile(
      rulesInput({
        profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'none', dietaryPreferences: [], allergies: ['Milk'], limits: [] },
        ingredients: [tagged('oat'), tagged('sugar')],
        declarations: [{ allergenId: 'milk', label: 'milk', presence: 'may_contain', source: 'Open Food Facts traces' }],
      }),
    );
    const milk = result.findings.find((finding) => finding.type === 'ALLERGEN');

    expect(result.status).toBe('review');
    expect(milk).toMatchObject({ severity: 'MEDIUM', detection: 'may_contain' });
    expect(milk?.reason).toMatch(/not a confirmed ingredient/i);
  });

  it('treats coconut as a tree nut only for the US pack', () => {
    const profile = {
      name: 'Aria',
      ageGroup: 'adult' as const,
      age: 30,
      diet: 'none' as const,
      dietaryPreferences: [],
      allergies: ['Tree nuts'],
      limits: [],
    };
    const ingredients = [tagged('coconut'), tagged('sugar')];

    const unitedStates = analyzeProfile(rulesInput({ profile, ingredients, countryCodes: ['US'] }));
    const unitedKingdom = analyzeProfile(rulesInput({ profile, ingredients, countryCodes: ['GB'] }));
    const unknown = analyzeProfile(rulesInput({ profile, ingredients, countryCodes: [] }));

    expect(unitedStates.findings.find((finding) => finding.type === 'ALLERGEN')?.severity).toBe('HIGH');
    expect(unitedStates.status).toBe('avoid');
    expect(unitedKingdom.findings.some((finding) => finding.type === 'ALLERGEN')).toBe(false);
    expect(unknown.findings.find((finding) => finding.type === 'ALLERGEN')).toMatchObject({
      severity: 'MEDIUM',
      detection: 'inferred',
    });
    expect(unknown.status).toBe('review');
  });

  it('does not treat coconut milk or peanut butter as dairy', () => {
    const result = analyzeProfile(
      rulesInput({
        profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'vegan', dietaryPreferences: [], allergies: ['Milk'], limits: [] },
        ingredients: [tagged('coconut milk'), tagged('peanut butter'), tagged('sugar')],
        countryCodes: ['GB'],
      }),
    );

    expect(result.findings.some((finding) => finding.type === 'ALLERGEN' && /milk/i.test(finding.reason))).toBe(false);
    expect(result.findings.some((finding) => finding.type === 'DIET' && /dairy/i.test(finding.reason))).toBe(false);
    expect(result.findings.some((finding) => finding.type === 'ALLERGEN' && finding.ingredient === 'peanut butter')).toBe(false);
  });

  it('flags peanut oil as a detected peanut ingredient', () => {
    const result = analyzeProfile(
      rulesInput({
        profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'none', dietaryPreferences: [], allergies: ['Peanuts'], limits: [] },
        ingredients: [tagged('peanut oil'), tagged('salt')],
      }),
    );
    expect(result.status).toBe('avoid');
    expect(result.findings.find((finding) => finding.type === 'ALLERGEN')?.reason).toMatch(/peanut oil/i);
  });

  it('matches a vegan profile to milk and a vegetarian profile to chicken', () => {
    const vegan = analyzeProfile(
      rulesInput({
        profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'vegan', dietaryPreferences: [], allergies: [], limits: [] },
        ingredients: [tagged('whey')],
      }),
    );
    const vegetarian = analyzeProfile(
      rulesInput({
        profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'vegetarian', dietaryPreferences: [], allergies: [], limits: [] },
        ingredients: [tagged('chicken'), tagged('rice')],
      }),
    );

    expect(vegan.status).toBe('avoid');
    expect(vegan.findings.some((finding) => finding.type === 'DIET')).toBe(true);
    expect(vegetarian.status).toBe('avoid');
    expect(vegetarian.findings.find((finding) => finding.type === 'DIET')?.reason).toMatch(/chicken/i);
    expect(vegetarian.findings.find((finding) => finding.type === 'DIET')?.reason).toMatch(/not a vegetarian certification/i);
  });

  it('flags added sugar from the ingredient list and sodium from a numeric threshold', () => {
    const sugar = analyzeProfile(
      rulesInput({
        profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'none', dietaryPreferences: [], allergies: [], limits: ['Added sugar'] },
        ingredients: [tagged('cane sugar'), tagged('oat')],
        countryCodes: ['GB'],
      }),
    );
    const sodium = analyzeProfile(
      rulesInput({
        profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'none', dietaryPreferences: [], allergies: [], limits: ['Sodium'] },
        ingredients: [tagged('water')],
        countryCodes: ['US'],
        nutrition: { perServing: { sodiumMg: 800 } },
      }),
    );
    const sodiumLow = analyzeProfile(
      rulesInput({
        profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'none', dietaryPreferences: [], allergies: [], limits: ['Sodium'] },
        ingredients: [tagged('water')],
        countryCodes: ['US'],
        nutrition: { perServing: { sodiumMg: 100 } },
      }),
    );

    expect(sugar.findings.find((finding) => finding.type === 'ADDED_SUGAR')?.detection).toBe('detected');
    expect(sugar.status).toBe('review');
    expect(sodium.status).toBe('review');
    expect(sodium.findings.find((finding) => finding.type === 'SODIUM')?.evidence[0]?.detail).toMatch(/800 mg/);
    expect(sodium.findings.find((finding) => finding.type === 'SODIUM')?.evidence[0]?.detail).toMatch(/460 mg/);
    expect(sodiumLow.status).toBe('suitable');
    expect(sodiumLow.clearChecks.join(' ')).toMatch(/100 mg/);
  });

  it('treats honey on a baby profile as high severity and cites the guidance', () => {
    const result = analyzeProfile(
      rulesInput({
        profile: { name: 'Sam', ageGroup: 'baby', age: null, diet: 'none', dietaryPreferences: [], allergies: [], limits: [] },
        ingredients: [tagged('honey'), tagged('water')],
      }),
    );
    const honey = result.findings.find((finding) => finding.type === 'AGE' && /honey/i.test(finding.title));

    expect(result.status).toBe('avoid');
    expect(honey?.severity).toBe('HIGH');
    expect(honey?.evidence[0]?.url).toMatch(/cdc\.gov/);
    expect(honey?.reason).toMatch(/not a diagnosis/i);
  });

  it('does not mark missing ingredient data as suitable', () => {
    const result = analyzeProfile(
      rulesInput({
        profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'none', dietaryPreferences: [], allergies: ['Peanuts'], limits: [] },
        ingredients: [],
        declarations: [],
      }),
    );
    expect(result.status).toBe('review');
    expect(result.findings[0]?.type).toBe('DATA_QUALITY');
    expect(result.clearChecks.some((check) => /peanut/i.test(check))).toBe(false);
  });

  it('keeps a label photo at review even when no ingredient rule matches', () => {
    const result = analyzeProfile(
      rulesInput({
        ingredients: [tagged('water'), tagged('rice')],
        sourceReliability: 'label_photo',
        countryCodes: ['IN'],
      }),
    );
    expect(result.status).toBe('review');
    expect(result.findings.some((finding) => /photo/i.test(finding.title))).toBe(true);
    expect(result.countryPacks.map((pack) => pack.code)).toEqual(['IN']);
  });

  it('uses the international pack when the country is unknown', () => {
    const result = analyzeProfile(rulesInput({ countryCodes: [], ingredients: [tagged('rice')] }));
    expect(result.countryPacks.map((pack) => pack.code)).toEqual(['INTL']);
    expect(result.limitations.join(' ')).toMatch(/country-specific labeling rules were not applied/i);
  });

  it('flags barley for a gluten-free preference and says it is not a diagnosis', () => {
    const result = analyzeProfile(
      rulesInput({
        profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'none', dietaryPreferences: ['Gluten-free'], allergies: [], limits: [] },
        ingredients: [tagged('barley'), tagged('water')],
      }),
    );
    const gluten = result.findings.find((finding) => finding.type === 'PREFERENCE');
    expect(result.status).toBe('avoid');
    expect(gluten?.reason).toMatch(/not a celiac diagnosis/i);
  });

  it('flags pork for a halal preference without claiming to certify the product', () => {
    const result = analyzeProfile(
      rulesInput({
        profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'none', dietaryPreferences: ['Halal'], allergies: [], limits: [] },
        ingredients: [tagged('pork'), tagged('rice')],
      }),
    );
    expect(result.status).toBe('avoid');
    expect(result.findings.find((finding) => finding.type === 'PREFERENCE')?.reason).toMatch(/not a halal certifier/i);
  });

  it('is deterministic and does not use vague safety language', () => {
    const input = rulesInput({
      profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'none', dietaryPreferences: [], allergies: ['Soy'], limits: [] },
      ingredients: [tagged('soy lecithin'), tagged('sugar')],
    });
    const first = analyzeProfile(input);
    const second = analyzeProfile(input);
    const summary = summarize(input, first);
    const text = JSON.stringify(first) + summary;

    expect(first).toEqual(second);
    expect(summary).toMatch(/not a guarantee/i);
    expect(summary).toMatch(/not a medical diagnosis/i);
    expect(text).not.toMatch(/bad for your body|medically safe|allergy-free|definitely safe/i);
  });

  it('says an unchecked allergy was not found and is not guaranteed absent', () => {
    const input = rulesInput({
      profile: { name: 'Aria', ageGroup: 'adult', age: 30, diet: 'none', dietaryPreferences: [], allergies: ['Peanuts'], limits: [] },
      ingredients: [tagged('rice'), tagged('salt')],
    });
    const result = analyzeProfile(input);
    const summary = summarize(input, result);

    expect(result.status).toBe('suitable');
    expect(result.clearChecks.join(' ')).toMatch(/Peanuts was not found/i);
    expect(summary).toMatch(/not a guarantee/i);
  });
});
