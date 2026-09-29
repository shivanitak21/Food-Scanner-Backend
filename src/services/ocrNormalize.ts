const PHRASES: Array<[RegExp, string]> = [
  [/\biodi[sz]ed\s+sa[l1|]t\b/gi, 'iodized salt'],
  [/\banna[t1]{2}o\b/gi, 'annatto'],
  [/\bmi1k\s+so[l1]ids\b/gi, 'milk solids'],
];

export function normalizeIngredientText(value: string): string {
  return PHRASES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value).replace(/\s+/g, ' ').trim();
}
