import { describe, expect, it } from 'vitest';

import { findingsFromReportMatches } from '../src/rules/healthContext';
import { familyHeadline } from '../src/services/presentAnalysis';
import { normalizeIngredientText } from '../src/services/ocrNormalize';

const productText = 'Rolled oats, iron, salt\nIron 4 mg\nSugars 2 g';

describe('health context', () => {
  it('keeps a match only when the report item and the product detail are both present', () => {
    const findings = findingsFromReportMatches({
      report: {
        biomarkers: [{ name: 'Ferritin', value: 8, unit: 'ng/mL', interpretation: 'low' }],
        dietaryRecommendations: [],
      },
      productText,
      matches: [
        {
          reportItem: 'Ferritin',
          productDetail: 'Iron',
          reason: 'Iron is listed, and ferritin is a confirmed value on this profile.',
        },
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('HEALTH_CONTEXT');
    expect(findings[0]?.title).toBe('Iron');
    expect(findings[0]?.evidence[0]?.title).toBe('Ferritin');
    expect(findings[0]?.reason.toLowerCase()).not.toMatch(/diagnosis|disease/);
  });

  it('drops a match that cites something not on this profile report', () => {
    const findings = findingsFromReportMatches({
      report: {
        biomarkers: [{ name: 'Ferritin', value: 8, unit: 'ng/mL', interpretation: 'low' }],
        dietaryRecommendations: [],
      },
      productText,
      matches: [
        {
          reportItem: 'LDL cholesterol',
          productDetail: 'Salt',
          reason: 'Salt is listed.',
        },
      ],
    });
    expect(findings).toHaveLength(0);
  });

  it('does not treat a normal confirmed value as a match', () => {
    const findings = findingsFromReportMatches({
      report: {
        biomarkers: [{ name: 'Ferritin', value: 40, unit: 'ng/mL', interpretation: 'normal' }],
        dietaryRecommendations: [],
      },
      productText,
      matches: [
        {
          reportItem: 'Ferritin',
          productDetail: 'Iron',
          reason: 'Iron is listed.',
        },
      ],
    });
    expect(findings).toHaveLength(0);
  });

  it('uses the product detail from the match as the family headline', () => {
    expect(
      familyHeadline('review', [{ title: 'Iron', severity: 'MEDIUM', type: 'HEALTH_CONTEXT' }]),
    ).toBe('Iron');
  });
});

describe('ingredient text normalization', () => {
  it('corrects a known salt misread without changing unrelated words', () => {
    expect(normalizeIngredientText('Butter, iodized sa1t, annatto')).toBe('Butter, iodized salt, annatto');
  });
});
