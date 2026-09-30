import type { Evidence, HealthInterpretation, RuleFinding } from './types';

/**
 * Turns a model comparison into findings.
 * A match is kept only when both sides already exist: a confirmed report item, and a product detail.
 * There is no fixed map from a biomarker name to a nutrient.
 */
export interface ConfirmedReport {
  biomarkers: Array<{
    name: string;
    value: number | null;
    unit: string | null;
    interpretation: HealthInterpretation | null;
  }>;
  dietaryRecommendations: string[];
}

export interface ReportMatchDraft {
  reportItem: string;
  productDetail: string;
  reason: string;
}

export function findingsFromReportMatches(input: {
  report: ConfirmedReport;
  productText: string;
  matches: ReportMatchDraft[];
}): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const seen = new Set<string>();

  for (const match of input.matches) {
    const reportItem = match.reportItem.trim();
    const productDetail = match.productDetail.trim();
    const reason = match.reason.replace(/\s+/g, ' ').trim();
    if (!reportItem || !productDetail || !reason) continue;
    if (!cites(productDetail, input.productText)) continue;

    const biomarker = input.report.biomarkers.find((item) => cites(reportItem, item.name) || cites(item.name, reportItem));
    const note = input.report.dietaryRecommendations.find((item) => cites(reportItem, item) || cites(item, reportItem));
    if (!biomarker && !note) continue;
    if (biomarker && !note && biomarker.interpretation === 'normal') continue;

    const key = `${canon(reportItem)}|${canon(productDetail)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const evidence: Evidence[] = [
      {
        title: reportItem,
        detail: biomarker
          ? [biomarker.value, biomarker.unit, biomarker.interpretation].filter((part) => part !== null && part !== undefined && part !== '').join(' ')
          : note,
        source: 'Confirmed on this profile',
      },
    ];

    findings.push({
      id: `HEALTH_CONTEXT:${findings.length}`,
      type: 'HEALTH_CONTEXT',
      title: productDetail.slice(0, 80),
      severity: 'MEDIUM',
      reason: reason.slice(0, 280),
      detection: 'nutrition_label',
      evidence,
    });
    if (findings.length >= 6) break;
  }

  return findings;
}

export function reportComparisonUnavailable(): RuleFinding {
  return {
    id: 'HEALTH_CONTEXT:unavailable',
    type: 'HEALTH_CONTEXT',
    title: 'Confirmed report',
    severity: 'INFO',
    reason: 'A confirmed report is saved for this profile, but it could not be compared with this product on this scan.',
    detection: 'missing_data',
    evidence: [
      {
        title: 'Confirmed report',
        detail: 'The comparison uses only values confirmed on this profile. It is not a diagnosis.',
      },
    ],
  };
}

function cites(needle: string, haystack: string): boolean {
  const left = canon(needle);
  const right = canon(haystack);
  if (!left || !right) return false;
  return right.includes(left) || (left.includes(right) && right.length > 3);
}

function canon(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
