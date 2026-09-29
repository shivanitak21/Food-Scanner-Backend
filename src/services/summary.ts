import type { AnalysisStatus, RuleFinding } from '../rules/types';

export function buildSummary(input: {
  profileName: string;
  productName: string;
  status: AnalysisStatus;
  findings: RuleFinding[];
  clearChecks: string[];
  sourceLabel: string;
}): string {
  const highs = input.findings.filter((finding) => finding.severity === 'HIGH');
  const mediums = input.findings.filter((finding) => finding.severity === 'MEDIUM');
  const sentences: string[] = [];

  if (input.status === 'avoid' && highs.length > 0) {
    sentences.push(`For ${input.profileName}, ${input.productName} is not suitable for this profile.`);
    sentences.push(...highs.slice(0, 2).map((finding) => finding.reason));
    if (highs.length > 2) {
      sentences.push(`${highs.length - 2} more high-severity findings are listed with their evidence.`);
    }
  } else if (input.status === 'review') {
    sentences.push(`For ${input.profileName}, review ${input.productName} before using it for this profile.`);
    const reviewReasons = (mediums.length > 0 ? mediums : input.findings).slice(0, 2).map((finding) => finding.reason);
    sentences.push(...reviewReasons);
  } else {
    sentences.push(
      `For ${input.profileName}, no configured rule matched a concern in the available data for ${input.productName}.`,
    );
  }

  const unseen = input.clearChecks.filter((check) => /not a guarantee/i.test(check)).slice(0, 2);
  sentences.push(...unseen);
  sentences.push(
    `Data source: ${input.sourceLabel}. This is not a medical diagnosis, and it is not a guarantee about ingredients or allergens that were not in the available data. Check the physical package label.`,
  );

  return sentences.join(' ').replace(/\s+/g, ' ').trim();
}
