export interface NutritionThresholds {
  name: string;
  sourceUrl: string;
  sugarsPer100gHigh?: number;
  sodiumMgPer100gHigh?: number;
  saturatedFatPer100gHigh?: number;
  sugarsPerServingHigh?: number;
  sodiumMgPerServingHigh?: number;
  saturatedFatPerServingHigh?: number;
}

export interface CountryPack {
  code: string;
  name: string;
  authority: string;
  sourceUrl: string;
  regulatedAllergens: string[];
  /** Ingredient terms that count toward an allergen only when this pack applies. */
  allergenTermExtensions: Partial<Record<string, string[]>>;
  nutrition?: NutritionThresholds;
}

const MAJOR = ['milk', 'egg', 'peanut', 'tree_nut', 'soy', 'wheat', 'fish', 'crustacean_shellfish', 'sesame', 'sulphite'];

/**
 * Country packs are data. Add a country by exporting another object here.
 * Numeric cut-offs are screening thresholds with a public source, not medical advice
 * and not a claim that every country uses the same label format.
 */
export const COUNTRY_PACKS: Record<string, CountryPack> = {
  US: {
    code: 'US',
    name: 'United States',
    authority: 'U.S. FDA',
    sourceUrl: 'https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies',
    regulatedAllergens: [...MAJOR, 'gluten'],
    allergenTermExtensions: {
      tree_nut: ['coconut'],
    },
    nutrition: {
      name: 'US FDA 20% Daily Value screen',
      sourceUrl: 'https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels',
      sodiumMgPerServingHigh: 460,
      saturatedFatPerServingHigh: 4,
      sugarsPerServingHigh: 10,
    },
  },
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    authority: 'UK Food Standards Agency',
    sourceUrl: 'https://www.food.gov.uk/business-guidance/allergen-guidance-for-food-businesses',
    regulatedAllergens: [
      ...MAJOR,
      'gluten',
      'mollusc',
      'celery',
      'mustard',
      'lupin',
    ],
    allergenTermExtensions: {},
    nutrition: {
      name: 'UK FSA traffic-light high cut-offs',
      sourceUrl: 'https://www.food.gov.uk/safety-hygiene/check-the-label',
      sugarsPer100gHigh: 22.5,
      sodiumMgPer100gHigh: 600,
      saturatedFatPer100gHigh: 5,
    },
  },
  CA: {
    code: 'CA',
    name: 'Canada',
    authority: 'Health Canada',
    sourceUrl:
      'https://www.canada.ca/en/health-canada/services/food-nutrition/food-safety/food-allergies-intolerances/food-allergies.html',
    regulatedAllergens: [...MAJOR, 'gluten', 'mollusc', 'mustard'],
    allergenTermExtensions: {},
    nutrition: {
      name: 'Health Canada 15% Daily Value screen',
      sourceUrl: 'https://www.canada.ca/en/health-canada/services/understanding-food-labels/percent-daily-value.html',
      sodiumMgPerServingHigh: 345,
      saturatedFatPerServingHigh: 3,
    },
  },
  IN: {
    code: 'IN',
    name: 'India',
    authority: 'FSSAI',
    sourceUrl: 'https://www.fssai.gov.in/',
    regulatedAllergens: ['gluten', 'milk', 'soy', 'peanut', 'tree_nut', 'egg', 'fish', 'crustacean_shellfish', 'sulphite'],
    allergenTermExtensions: {},
  },
};

export const INTERNATIONAL_PACK: CountryPack = {
  code: 'INTL',
  name: 'International screening baseline',
  authority: 'UK FSA traffic-light cut-offs used when no country pack matches',
  sourceUrl: 'https://www.food.gov.uk/safety-hygiene/check-the-label',
  regulatedAllergens: MAJOR,
  allergenTermExtensions: {},
  nutrition: {
    name: 'Per 100 g screening thresholds',
    sourceUrl: 'https://www.food.gov.uk/safety-hygiene/check-the-label',
    sugarsPer100gHigh: 22.5,
    sodiumMgPer100gHigh: 600,
    saturatedFatPer100gHigh: 5,
  },
};

const COUNTRY_ALIASES: Record<string, string> = {
  us: 'US',
  usa: 'US',
  'united states': 'US',
  'united states of america': 'US',
  'en:united-states': 'US',
  'en:united-states-of-america': 'US',
  gb: 'GB',
  uk: 'GB',
  'united kingdom': 'GB',
  britain: 'GB',
  'en:united-kingdom': 'GB',
  ca: 'CA',
  canada: 'CA',
  'en:canada': 'CA',
  in: 'IN',
  india: 'IN',
  'en:india': 'IN',
  fr: 'FR',
  france: 'FR',
  'en:france': 'FR',
  de: 'DE',
  germany: 'DE',
  'en:germany': 'DE',
  au: 'AU',
  australia: 'AU',
  'en:australia': 'AU',
};

export function normalizeCountryCode(input: string | undefined | null): string | null {
  if (!input) return null;
  const key = input.trim().toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
  if (!key) return null;
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];
  if (/^[a-z]{2}$/i.test(input.trim())) return input.trim().toUpperCase();
  return null;
}

export function resolvePacks(countryCodes: string[]): CountryPack[] {
  const specific = countryCodes
    .map((code) => COUNTRY_PACKS[code])
    .filter((pack): pack is CountryPack => Boolean(pack));
  if (specific.length === 0) return [INTERNATIONAL_PACK];
  return specific;
}

export function packsMention(packs: CountryPack[]): string {
  return packs.map((pack) => pack.name).join(', ');
}
