const BANNED_EXPLANATION = [
  /medically safe/i,
  /allergy-free/i,
  /will not (cause|trigger)/i,
  /100% safe/i,
  /definitely safe/i,
  /safe for (your|this|an) allerg/i,
  /this food is (safe|bad)/i,
  /bad for your body/i,
];

export function explanationIsUsable(text: string, mustMention: string[]): boolean {
  if (text.length < 20 || text.length > 900) return false;
  if (BANNED_EXPLANATION.some((pattern) => pattern.test(text))) return false;
  if (!/not a medical diagnosis/i.test(text)) return false;
  const lower = text.toLowerCase();
  return mustMention.every((item) => lower.includes(item.toLowerCase()));
}
