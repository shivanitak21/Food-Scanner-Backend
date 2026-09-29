import { resolveAllergyIds, tagIngredientName } from '../rules/dictionaries';
import { uniqueStrings } from '../rules/text';
import type { AllergenDeclaration, TaggedIngredient } from '../rules/types';

export interface PreparedIngredients {
  ingredientsText: string;
  ingredients: TaggedIngredient[];
  declarations: AllergenDeclaration[];
}

export function separateLabelSections(text: string): {
  ingredientText: string;
  contains: string[];
  mayContain: string[];
} {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const mayMatch = normalized.match(/\bmay contains?\b\s*:?\s*([^.]+)/i);
  const withoutMay = mayMatch ? normalized.replace(mayMatch[0], ' ') : normalized;
  const containsMatch = withoutMay.match(/\bcontains\b\s*:\s*([^.]+)/i);
  const ingredientText = (containsMatch ? withoutMay.replace(containsMatch[0], ' ') : withoutMay)
    .replace(/^ingredients?\s*:\s*/i, '')
    .trim();

  return {
    ingredientText,
    contains: splitList(containsMatch?.[1] ?? ''),
    mayContain: splitList(mayMatch?.[1] ?? ''),
  };
}

export function splitIngredientList(text: string): string[] {
  return uniqueStrings(splitList(text).map(cleanIngredient));
}

export function prepareIngredients(
  text: string,
  extras?: { contains?: string[]; mayContain?: string[]; source?: string },
): PreparedIngredients {
  const sections = separateLabelSections(text);
  const contains = uniqueStrings([...sections.contains, ...(extras?.contains ?? [])]);
  const mayContain = uniqueStrings([...sections.mayContain, ...(extras?.mayContain ?? [])]);
  const parts = splitIngredientList([sections.ingredientText, ...contains].filter(Boolean).join(', '));
  const source = extras?.source ?? 'Label statement';

  return {
    ingredientsText: sections.ingredientText,
    ingredients: parts.map((raw) => ({
      raw,
      name: cleanIngredient(raw),
      tags: tagIngredientName(raw),
    })),
    declarations: mayContainDeclarations(mayContain, source),
  };
}

function mayContainDeclarations(phrases: string[], source: string): AllergenDeclaration[] {
  const declarations: AllergenDeclaration[] = [];
  for (const phrase of phrases) {
    const ids = new Set(resolveAllergyIds(phrase));
    for (const tag of tagIngredientName(phrase)) {
      if (tag.kind === 'allergen') ids.add(tag.id);
    }
    for (const allergenId of ids) {
      declarations.push({
        allergenId,
        label: phrase,
        presence: 'may_contain',
        source,
      });
    }
  }
  return declarations;
}

function splitList(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const char of text) {
    if (char === '(' || char === '[') depth += 1;
    if ((char === ')' || char === ']') && depth > 0) depth -= 1;
    if ((char === ',' || char === ';' || char === '·') && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function cleanIngredient(value: string): string {
  return value
    .replace(/\(\s*\d+(?:\.\d+)?\s*%\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.*•\-–]+/, '')
    .replace(/[.\s]+$/, '')
    .trim();
}
