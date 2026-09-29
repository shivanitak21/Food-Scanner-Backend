import type { Evidence, HealthContextRules, RuleFinding } from './types';

/**
 * Matches confirmed profile context to product nutrients.
 * It does not diagnose, prescribe, or decide that a food treats a condition.
 */
export function healthContextFindings(input: {
  context?: HealthContextRules;
  saturatedFatHigh: boolean;
  sugarHigh: boolean;
  sodiumHigh: boolean;
}): RuleFinding[] {
  if (!input.context?.enabled) return [];
  const findings: RuleFinding[] = [];
  const biomarkers = input.context.biomarkers.filter((item) => item.name.trim());
  const recommendations = input.context.dietaryRecommendations.map((item) => item.trim()).filter(Boolean);

  if (input.saturatedFatHigh && relevant(biomarkers, recommendations, /ldl|cholesterol|triglyceride/i, /saturated fat|cholesterol/i)) {
    findings.push(finding('saturated_fat', 'Saturated fat', 'High saturated fat is relevant to the health context you have provided.'));
  }
  if (input.sugarHigh && relevant(biomarkers, recommendations, /hba1c|a1c|glucose|blood sugar/i, /sugar/i)) {
    findings.push(finding('sugar', 'Sugar', 'Sugar in this product is relevant to the health context you have provided.'));
  }
  if (input.sodiumHigh && recommendations.some((item) => /sodium|salt/i.test(item))) {
    findings.push(finding('sodium', 'Sodium', 'Sodium in this product is relevant to a dietary note you confirmed.'));
  }
  return findings;
}

function relevant(
  biomarkers: HealthContextRules['biomarkers'],
  recommendations: string[],
  biomarkerPattern: RegExp,
  recommendationPattern: RegExp,
): boolean {
  const flagged = biomarkers.some(
    (item) => biomarkerPattern.test(item.name) && (item.interpretation === 'elevated' || item.interpretation === 'borderline'),
  );
  return flagged || recommendations.some((item) => recommendationPattern.test(item));
}

function finding(id: string, title: string, reason: string): RuleFinding {
  const evidence: Evidence[] = [
    {
      title: 'Confirmed health context',
      detail:
        'This uses information you confirmed on the profile. It is not a diagnosis. If you later change or remove that context, a new scan will follow the updated profile.',
    },
  ];
  return {
    id: `HEALTH_CONTEXT:${id}`,
    type: 'HEALTH_CONTEXT',
    title,
    severity: 'MEDIUM',
    reason,
    detection: 'nutrition_label',
    evidence,
  };
}
