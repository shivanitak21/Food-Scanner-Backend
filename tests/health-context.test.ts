import { describe, expect, it } from 'vitest';

import { healthContextFindings } from '../src/rules/healthContext';
import { familyHeadline } from '../src/services/presentAnalysis';
import { normalizeIngredientText } from '../src/services/ocrNormalize';

describe('health context', () => {
  it('surfaces saturated fat only when the user confirmed an elevated cholesterol-related value', () => {
    const findings = healthContextFindings({
      context: {
        enabled: true,
        biomarkers: [{ name: 'LDL cholesterol', interpretation: 'elevated' }],
        dietaryRecommendations: [],
      },
      saturatedFatHigh: true,
      sugarHigh: false,
      sodiumHigh: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('HEALTH_CONTEXT');
    expect(findings[0]?.reason).toMatch(/health context you have provided/i);
    expect(findings[0]?.reason.toLowerCase()).not.toMatch(/dangerous|diagnosis|heart disease/);
  });

  it('does not treat a normal result as a reason to review saturated fat', () => {
    const findings = healthContextFindings({
      context: {
        enabled: true,
        biomarkers: [{ name: 'LDL cholesterol', interpretation: 'normal' }],
        dietaryRecommendations: [],
      },
      saturatedFatHigh: true,
      sugarHigh: false,
      sodiumHigh: false,
    });
    expect(findings).toHaveLength(0);
  });

  it('hides the medical detail in the family headline', () => {
    expect(
      familyHeadline('review', [{ title: 'Saturated fat', severity: 'MEDIUM', type: 'HEALTH_CONTEXT' }]),
    ).toBe('Health context');
  });
});

describe('ingredient text normalization', () => {
  it('corrects a known salt misread without changing unrelated words', () => {
    expect(normalizeIngredientText('Butter, iodized sa1t, annatto')).toBe('Butter, iodized salt, annatto');
  });
});
