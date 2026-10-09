import type { NutritionFacts, NutrientAmount } from '../rules/types';

export interface NutritionItem {
  id: string;
  name: string;
  amount: string;
  unit?: string;
  dailyValuePercent?: number;
  note?: string;
}

export interface LabelNutrientInput {
  name: string;
  amount: string;
  unit?: string;
  basis?: 'per_100g' | 'per_serving' | 'unknown';
}

const NUTRIENT_KEYS: Record<string, keyof NutrientAmount | 'salt'> = {
  energy: 'energyKcal',
  calories: 'energyKcal',
  kcal: 'energyKcal',
  fat: 'fatG',
  'total fat': 'fatG',
  'saturated fat': 'saturatedFatG',
  saturates: 'saturatedFatG',
  carbohydrate: 'carbohydratesG',
  carbohydrates: 'carbohydratesG',
  carbs: 'carbohydratesG',
  sugar: 'sugarsG',
  sugars: 'sugarsG',
  'total sugars': 'sugarsG',
  fiber: 'fiberG',
  fibre: 'fiberG',
  'dietary fiber': 'fiberG',
  'dietary fibre': 'fiberG',
  protein: 'proteinG',
  proteins: 'proteinG',
  salt: 'salt',
  sodium: 'sodiumMg',
  'trans fat': 'transFatG',
  'trans-fat': 'transFatG',
};

export function nutritionFromLabelItems(items: LabelNutrientInput[]): { facts: NutritionFacts | null; items: NutritionItem[] } {
  const per100g: NutrientAmount & { saltG?: number } = {};
  const perServing: NutrientAmount & { saltG?: number } = {};
  const display: NutritionItem[] = [];

  items.forEach((item, index) => {
    const key = NUTRIENT_KEYS[item.name.trim().toLowerCase()];
    const numeric = Number(item.amount.replace(/,/g, ''));
    if (!key || !Number.isFinite(numeric)) return;
    const basis = item.basis === 'per_serving' ? 'per_serving' : item.basis === 'per_100g' ? 'per_100g' : 'per_100g';
    const target = basis === 'per_serving' ? perServing : per100g;
    const unit = (item.unit ?? '').trim().toLowerCase();

    if (key === 'salt') {
      target.saltG = unit === 'mg' ? numeric / 1000 : numeric;
    } else if (key === 'sodiumMg') {
      target.sodiumMg = unit === 'g' ? numeric * 1000 : numeric;
    } else if (key === 'energyKcal') {
      target.energyKcal = numeric;
    } else {
      target[key] = unit === 'mg' ? numeric / 1000 : numeric;
    }

    display.push({
      id: `nutrient-${index}`,
      name: item.name.trim(),
      amount: trimNumber(numeric),
      unit: item.unit?.trim() || undefined,
      note: basis === 'per_serving' ? 'per serving' : 'per 100 g',
    });
  });

  applySaltFallback(per100g);
  applySaltFallback(perServing);

  const facts: NutritionFacts = {};
  if (hasAmount(per100g)) facts.per100g = per100g;
  if (hasAmount(perServing)) facts.perServing = perServing;
  return { facts: hasAmount(facts.per100g) || hasAmount(facts.perServing) ? facts : null, items: display };
}

export function displayNutrition(facts: NutritionFacts | null, countryCodes: string[]): NutritionItem[] {
  if (!facts) return [];
  const serving = facts.perServing;
  const per100 = facts.per100g;
  const useServing = Boolean(serving && hasAmount(serving));
  const source = useServing ? serving : per100;
  if (!source) return [];
  const note = useServing ? serving?.servingSize ?? 'per serving' : 'per 100 g';
  const showDailyValue = countryCodes.includes('US') || countryCodes.includes('CA');
  const rows: Array<{ id: string; name: string; value?: number; unit: string; daily?: number }> = [
    { id: 'energy', name: 'Energy', value: source.energyKcal, unit: 'kcal' },
    { id: 'fat', name: 'Fat', value: source.fatG, unit: 'g' },
    { id: 'saturated-fat', name: 'Saturated fat', value: source.saturatedFatG, unit: 'g', daily: showDailyValue && useServing ? 20 : undefined },
    { id: 'carbohydrates', name: 'Carbohydrates', value: source.carbohydratesG, unit: 'g' },
    { id: 'sugars', name: 'Sugars', value: source.sugarsG, unit: 'g' },
    { id: 'protein', name: 'Protein', value: source.proteinG, unit: 'g' },
    { id: 'salt', name: 'Salt', value: source.saltG, unit: 'g' },
    { id: 'sodium', name: 'Sodium', value: source.sodiumMg, unit: 'mg', daily: showDailyValue && useServing ? 2300 : undefined },
  ];

  return rows
    .filter((row) => row.value !== undefined)
    .map((row) => ({
      id: row.id,
      name: row.name,
      amount: trimNumber(row.value as number),
      unit: row.unit,
      dailyValuePercent: row.daily ? Math.round(((row.value as number) / row.daily) * 100) : undefined,
      note: row.daily ? `${note}. Percent daily value uses a ${row.daily} ${row.unit} reference from US and Canadian labels.` : note,
    }));
}

function applySaltFallback(amount: NutrientAmount): void {
  if (amount.sodiumMg === undefined && amount.saltG !== undefined) {
    amount.sodiumMg = Math.round(amount.saltG * 400);
  }
}

function hasAmount(amount: object | undefined): boolean {
  if (!amount) return false;
  return Object.values(amount).some((value) => typeof value === 'number');
}

function trimNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, '');
}
