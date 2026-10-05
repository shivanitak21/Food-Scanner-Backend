import type { AnalysisStatus, RuleFinding } from '../rules/types';

export type FitStatus = 'GOOD_FIT' | 'REVIEW' | 'DOES_NOT_FIT' | 'INSUFFICIENT_INFORMATION';

export const FIT_LABEL = {
  GOOD_FIT: 'Good fit',
  REVIEW: 'Review',
  DOES_NOT_FIT: "Doesn't fit",
  INSUFFICIENT_INFORMATION: 'Not enough information',
} as const;

export function deriveFit(
  status: AnalysisStatus,
  findings: Array<Pick<RuleFinding, 'type' | 'severity' | 'title'>>,
): FitStatus {
  const conflicts = findings.filter(
    (finding) => finding.severity !== 'INFO' && finding.type !== 'DATA_QUALITY',
  );
  const ingredientsMissing = findings.some(
    (finding) => finding.type === 'DATA_QUALITY' && /ingredient list unavailable/i.test(finding.title),
  );

  if (conflicts.length === 0 && ingredientsMissing) return 'INSUFFICIENT_INFORMATION';
  if (status === 'avoid' || conflicts.some((finding) => finding.severity === 'HIGH')) return 'DOES_NOT_FIT';
  if (status === 'review' || conflicts.some((finding) => finding.severity === 'MEDIUM')) return 'REVIEW';
  return 'GOOD_FIT';
}
