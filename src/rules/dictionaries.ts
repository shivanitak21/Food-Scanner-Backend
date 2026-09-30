import { textIncludesTerm } from './text';
import type { IngredientTag } from './types';

export interface TermRule {
  term: string;
  allergens?: string[];
  flags?: string[];
  detection: 'detected' | 'inferred';
  /** Skip this rule when the ingredient already contains one of these phrases. */
  unlessTerms?: string[];
}

const PLANT_MILKS = [
  'coconut milk',
  'almond milk',
  'soy milk',
  'soya milk',
  'oat milk',
  'rice milk',
  'cashew milk',
  'hemp milk',
  'pea milk',
];

const NON_WHEAT_FLOURS = [
  'rice flour',
  'corn flour',
  'maize flour',
  'almond flour',
  'chickpea flour',
  'gram flour',
  'besan',
  'oat flour',
  'buckwheat flour',
  'tapioca flour',
  'potato flour',
  'sorghum flour',
  'millet flour',
  'coconut flour',
];

/**
 * Ingredient phrases mapped to allergen ids and diet/limit flags.
 * Longer phrases are listed first so a specific match can suppress a broader one.
 * Coconut is intentionally absent: US FDA treats it as a tree nut and UK/Canada lists do not.
 * That difference is applied in the rules engine from country packs.
 */
export const TERM_RULES: TermRule[] = [
  { term: 'skimmed milk powder', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'skim milk powder', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'milk powder', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'buttermilk', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'condensed milk', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'evaporated milk', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'whole milk', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'skimmed milk', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'skim milk', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'lactalbumin', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'whey', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'casein', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'caseinate', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'lactose', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'ghee', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  {
    term: 'butter',
    allergens: ['milk'],
    flags: ['dairy'],
    detection: 'detected',
    unlessTerms: ['peanut butter', 'almond butter', 'cashew butter', 'cocoa butter', 'shea butter', 'apple butter', 'sunflower butter'],
  },
  {
    term: 'cream',
    allergens: ['milk'],
    flags: ['dairy'],
    detection: 'detected',
    unlessTerms: ['cream of tartar'],
  },
  { term: 'cheese', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'yogurt', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'yoghurt', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'paneer', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'khoya', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'khoa', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'mawa', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'dahi', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  { term: 'curd', allergens: ['milk'], flags: ['dairy'], detection: 'detected' },
  {
    term: 'milk',
    allergens: ['milk'],
    flags: ['dairy'],
    detection: 'detected',
    unlessTerms: PLANT_MILKS,
  },

  { term: 'egg white', allergens: ['egg'], flags: ['egg'], detection: 'detected' },
  { term: 'egg yolk', allergens: ['egg'], flags: ['egg'], detection: 'detected' },
  { term: 'ovalbumin', allergens: ['egg'], flags: ['egg'], detection: 'detected' },
  { term: 'albumin', allergens: ['egg'], flags: ['egg'], detection: 'detected' },
  { term: 'mayonnaise', allergens: ['egg'], flags: ['egg'], detection: 'detected' },
  { term: 'eggs', allergens: ['egg'], flags: ['egg'], detection: 'detected' },
  { term: 'egg', allergens: ['egg'], flags: ['egg'], detection: 'detected' },

  { term: 'groundnuts', allergens: ['peanut'], detection: 'detected' },
  { term: 'groundnut', allergens: ['peanut'], detection: 'detected' },
  { term: 'peanut oil', allergens: ['peanut'], detection: 'detected' },
  { term: 'peanuts', allergens: ['peanut'], detection: 'detected' },
  { term: 'peanut', allergens: ['peanut'], detection: 'detected' },
  { term: 'arachis', allergens: ['peanut'], detection: 'detected' },

  { term: 'brazil nut', allergens: ['tree_nut'], detection: 'detected' },
  { term: 'pine nut', allergens: ['tree_nut'], detection: 'detected' },
  { term: 'macadamia', allergens: ['tree_nut'], detection: 'detected' },
  { term: 'hazelnut', allergens: ['tree_nut'], detection: 'detected' },
  { term: 'pistachio', allergens: ['tree_nut'], detection: 'detected' },
  { term: 'almond', allergens: ['tree_nut'], detection: 'detected' },
  { term: 'cashew', allergens: ['tree_nut'], detection: 'detected' },
  { term: 'walnut', allergens: ['tree_nut'], detection: 'detected' },
  { term: 'pecan', allergens: ['tree_nut'], detection: 'detected' },
  { term: 'chestnut', allergens: ['tree_nut'], detection: 'detected' },
  { term: 'praline', allergens: ['tree_nut'], detection: 'detected' },
  { term: 'tree nuts', allergens: ['tree_nut'], detection: 'detected' },
  { term: 'nuts', allergens: ['tree_nut'], detection: 'inferred' },

  { term: 'soy lecithin', allergens: ['soy'], detection: 'detected' },
  { term: 'soya lecithin', allergens: ['soy'], detection: 'detected' },
  { term: 'soybeans', allergens: ['soy'], detection: 'detected' },
  { term: 'soybean', allergens: ['soy'], detection: 'detected' },
  { term: 'edamame', allergens: ['soy'], detection: 'detected' },
  { term: 'tempeh', allergens: ['soy'], detection: 'detected' },
  { term: 'tofu', allergens: ['soy'], detection: 'detected' },
  { term: 'miso', allergens: ['soy'], detection: 'detected' },
  { term: 'soya', allergens: ['soy'], detection: 'detected' },
  { term: 'soy', allergens: ['soy'], detection: 'detected' },

  { term: 'wheat flour', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'maida', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'atta', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'suji', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'whole wheat', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'graham flour', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'semolina', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'durum', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'spelt', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'farro', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'bulgur', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'couscous', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'wheat', allergens: ['wheat', 'gluten'], flags: ['gluten'], detection: 'detected' },
  {
    term: 'flour',
    allergens: ['wheat', 'gluten'],
    flags: ['gluten'],
    detection: 'inferred',
    unlessTerms: NON_WHEAT_FLOURS,
  },

  { term: 'barley malt', allergens: ['gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'barley', allergens: ['gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'triticale', allergens: ['gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'rye', allergens: ['gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'gluten', allergens: ['gluten'], flags: ['gluten'], detection: 'detected' },
  { term: 'malt', allergens: ['gluten'], flags: ['gluten'], detection: 'inferred', unlessTerms: ['maltodextrin'] },
  { term: 'oats', allergens: ['gluten'], flags: ['gluten'], detection: 'inferred' },
  { term: 'oat', allergens: ['gluten'], flags: ['gluten'], detection: 'inferred' },

  { term: 'fish sauce', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'worcestershire', allergens: ['fish'], flags: ['fish'], detection: 'inferred' },
  { term: 'anchovies', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'anchovy', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'sardines', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'sardine', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'salmon', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'tuna', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'cod', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'pollock', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'tilapia', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'haddock', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'mackerel', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'trout', allergens: ['fish'], flags: ['fish'], detection: 'detected' },
  { term: 'fish', allergens: ['fish'], flags: ['fish'], detection: 'detected' },

  { term: 'shrimp', allergens: ['crustacean_shellfish'], flags: ['shellfish'], detection: 'detected' },
  { term: 'prawn', allergens: ['crustacean_shellfish'], flags: ['shellfish'], detection: 'detected' },
  { term: 'crab', allergens: ['crustacean_shellfish'], flags: ['shellfish'], detection: 'detected' },
  { term: 'lobster', allergens: ['crustacean_shellfish'], flags: ['shellfish'], detection: 'detected' },
  { term: 'crayfish', allergens: ['crustacean_shellfish'], flags: ['shellfish'], detection: 'detected' },
  { term: 'langoustine', allergens: ['crustacean_shellfish'], flags: ['shellfish'], detection: 'detected' },

  { term: 'mussel', allergens: ['mollusc'], flags: ['shellfish'], detection: 'detected' },
  { term: 'oyster', allergens: ['mollusc'], flags: ['shellfish'], detection: 'detected' },
  { term: 'clam', allergens: ['mollusc'], flags: ['shellfish'], detection: 'detected' },
  { term: 'scallop', allergens: ['mollusc'], flags: ['shellfish'], detection: 'detected' },
  { term: 'squid', allergens: ['mollusc'], flags: ['shellfish'], detection: 'detected' },
  { term: 'octopus', allergens: ['mollusc'], flags: ['shellfish'], detection: 'detected' },
  { term: 'snail', allergens: ['mollusc'], flags: ['shellfish'], detection: 'detected' },

  { term: 'sesame seed', allergens: ['sesame'], detection: 'detected' },
  { term: 'sesame', allergens: ['sesame'], detection: 'detected' },
  { term: 'tahini', allergens: ['sesame'], detection: 'detected' },
  { term: 'til', allergens: ['sesame'], detection: 'detected' },

  { term: 'celeriac', allergens: ['celery'], detection: 'detected' },
  { term: 'celery', allergens: ['celery'], detection: 'detected' },
  { term: 'mustard seed', allergens: ['mustard'], detection: 'detected' },
  { term: 'mustard', allergens: ['mustard'], detection: 'detected' },

  { term: 'sulphur dioxide', allergens: ['sulphite'], detection: 'detected' },
  { term: 'sulfur dioxide', allergens: ['sulphite'], detection: 'detected' },
  { term: 'sodium bisulfite', allergens: ['sulphite'], detection: 'detected' },
  { term: 'sodium bisulphite', allergens: ['sulphite'], detection: 'detected' },
  { term: 'metabisulphite', allergens: ['sulphite'], detection: 'detected' },
  { term: 'metabisulfite', allergens: ['sulphite'], detection: 'detected' },
  { term: 'sulphite', allergens: ['sulphite'], detection: 'detected' },
  { term: 'sulfite', allergens: ['sulphite'], detection: 'detected' },
  { term: 'e220', allergens: ['sulphite'], detection: 'detected' },
  { term: 'e221', allergens: ['sulphite'], detection: 'detected' },
  { term: 'e222', allergens: ['sulphite'], detection: 'detected' },
  { term: 'e223', allergens: ['sulphite'], detection: 'detected' },
  { term: 'e224', allergens: ['sulphite'], detection: 'detected' },
  { term: 'e226', allergens: ['sulphite'], detection: 'detected' },
  { term: 'e228', allergens: ['sulphite'], detection: 'detected' },

  { term: 'lupini', allergens: ['lupin'], detection: 'detected' },
  { term: 'lupine', allergens: ['lupin'], detection: 'detected' },
  { term: 'lupin', allergens: ['lupin'], detection: 'detected' },

  { term: 'high fructose corn syrup', flags: ['added_sugar'], detection: 'detected' },
  { term: 'corn syrup', flags: ['added_sugar'], detection: 'detected' },
  { term: 'cane sugar', flags: ['added_sugar'], detection: 'detected' },
  { term: 'brown sugar', flags: ['added_sugar'], detection: 'detected' },
  { term: 'invert sugar', flags: ['added_sugar'], detection: 'detected' },
  { term: 'coconut sugar', flags: ['added_sugar'], detection: 'detected' },
  { term: 'rice syrup', flags: ['added_sugar'], detection: 'detected' },
  { term: 'maple syrup', flags: ['added_sugar'], detection: 'detected' },
  { term: 'agave', flags: ['added_sugar'], detection: 'detected' },
  { term: 'molasses', flags: ['added_sugar'], detection: 'detected' },
  { term: 'dextrose', flags: ['added_sugar'], detection: 'detected' },
  { term: 'maltose', flags: ['added_sugar'], detection: 'detected' },
  { term: 'sucrose', flags: ['added_sugar'], detection: 'detected' },
  { term: 'glucose', flags: ['added_sugar'], detection: 'detected' },
  { term: 'fructose', flags: ['added_sugar'], detection: 'detected' },
  { term: 'palm sugar', flags: ['added_sugar'], detection: 'detected' },
  { term: 'jaggery', flags: ['added_sugar'], detection: 'detected' },
  { term: 'gur', flags: ['added_sugar'], detection: 'detected' },
  { term: 'honey', flags: ['added_sugar', 'honey'], detection: 'detected' },
  { term: 'sugar', flags: ['added_sugar'], detection: 'detected' },

  { term: 'acesulfame potassium', flags: ['artificial_sweetener'], detection: 'detected' },
  { term: 'acesulfame', flags: ['artificial_sweetener'], detection: 'detected' },
  { term: 'aspartame', flags: ['artificial_sweetener'], detection: 'detected' },
  { term: 'sucralose', flags: ['artificial_sweetener'], detection: 'detected' },
  { term: 'saccharin', flags: ['artificial_sweetener'], detection: 'detected' },
  { term: 'neotame', flags: ['artificial_sweetener'], detection: 'detected' },
  { term: 'advantame', flags: ['artificial_sweetener'], detection: 'detected' },
  { term: 'cyclamate', flags: ['artificial_sweetener'], detection: 'detected' },
  { term: 'artificial sweetener', flags: ['artificial_sweetener'], detection: 'detected' },

  { term: 'caffeine', flags: ['caffeine_strong'], detection: 'detected' },
  { term: 'guarana', flags: ['caffeine_strong'], detection: 'detected' },
  { term: 'espresso', flags: ['caffeine_strong'], detection: 'detected' },
  { term: 'coffee', flags: ['caffeine_strong'], detection: 'detected' },
  { term: 'yerba mate', flags: ['caffeine_mild'], detection: 'inferred' },
  { term: 'green tea', flags: ['caffeine_mild'], detection: 'inferred' },
  { term: 'black tea', flags: ['caffeine_mild'], detection: 'inferred' },
  { term: 'tea', flags: ['caffeine_mild'], detection: 'inferred' },
  { term: 'cocoa', flags: ['caffeine_mild'], detection: 'inferred' },
  { term: 'chocolate', flags: ['caffeine_mild'], detection: 'inferred' },
  { term: 'cola', flags: ['caffeine_mild'], detection: 'inferred' },

  { term: 'sodium chloride', flags: ['salt'], detection: 'detected' },
  { term: 'sea salt', flags: ['salt'], detection: 'detected' },
  { term: 'salted', flags: ['salt'], detection: 'detected' },
  { term: 'salt', flags: ['salt'], detection: 'detected' },

  { term: 'gelatin', flags: ['gelatin', 'meat'], detection: 'detected' },
  { term: 'gelatine', flags: ['gelatin', 'meat'], detection: 'detected' },
  { term: 'carmine', flags: ['carmine'], detection: 'detected' },
  { term: 'cochineal', flags: ['carmine'], detection: 'detected' },
  { term: 'lard', flags: ['meat', 'pork'], detection: 'detected' },
  { term: 'bacon', flags: ['meat', 'pork'], detection: 'detected' },
  { term: 'ham', flags: ['meat', 'pork'], detection: 'detected' },
  { term: 'pork', flags: ['meat', 'pork'], detection: 'detected' },
  { term: 'beef', flags: ['meat'], detection: 'detected' },
  { term: 'chicken', flags: ['meat'], detection: 'detected' },
  { term: 'turkey', flags: ['meat'], detection: 'detected' },
  { term: 'lamb', flags: ['meat'], detection: 'detected' },
  { term: 'tallow', flags: ['meat'], detection: 'detected' },
  { term: 'poultry', flags: ['meat'], detection: 'detected' },
  { term: 'meat', flags: ['meat'], detection: 'detected' },

  { term: 'ethyl alcohol', flags: ['alcohol'], detection: 'detected' },
  { term: 'whiskey', flags: ['alcohol'], detection: 'detected' },
  { term: 'whisky', flags: ['alcohol'], detection: 'detected' },
  { term: 'beer', flags: ['alcohol'], detection: 'detected' },
  { term: 'wine', flags: ['alcohol'], detection: 'detected' },
  { term: 'rum', flags: ['alcohol'], detection: 'detected' },
  { term: 'alcohol', flags: ['alcohol'], detection: 'detected' },
  { term: 'vanilla extract', flags: ['alcohol_possible'], detection: 'inferred' },
];

export const ALLERGEN_LABELS: Record<string, string> = {
  milk: 'milk',
  egg: 'egg',
  peanut: 'peanut',
  tree_nut: 'tree nuts',
  soy: 'soy',
  wheat: 'wheat',
  fish: 'fish',
  crustacean_shellfish: 'crustacean shellfish',
  mollusc: 'molluscs',
  sesame: 'sesame',
  celery: 'celery',
  mustard: 'mustard',
  sulphite: 'sulphites',
  lupin: 'lupin',
  gluten: 'gluten',
};

const ALLERGY_ALIASES: Record<string, string[]> = {
  milk: ['milk'],
  dairy: ['milk'],
  eggs: ['egg'],
  egg: ['egg'],
  peanuts: ['peanut'],
  peanut: ['peanut'],
  groundnut: ['peanut'],
  groundnuts: ['peanut'],
  'tree nuts': ['tree_nut'],
  'tree nut': ['tree_nut'],
  nuts: ['tree_nut'],
  soy: ['soy'],
  soya: ['soy'],
  soybeans: ['soy'],
  wheat: ['wheat'],
  fish: ['fish'],
  shellfish: ['crustacean_shellfish', 'mollusc'],
  crustaceans: ['crustacean_shellfish'],
  molluscs: ['mollusc'],
  mollusks: ['mollusc'],
  sesame: ['sesame'],
  celery: ['celery'],
  mustard: ['mustard'],
  sulphites: ['sulphite'],
  sulfites: ['sulphite'],
  sulphite: ['sulphite'],
  lupin: ['lupin'],
  lupine: ['lupin'],
  gluten: ['gluten'],
};

export function resolveAllergyIds(label: string): string[] {
  const key = label.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return ALLERGY_ALIASES[key] ?? [];
}

export function tagIngredientName(name: string): IngredientTag[] {
  const tags: IngredientTag[] = [];
  const seen = new Set<string>();

  for (const rule of TERM_RULES) {
    if (!textIncludesTerm(name, rule.term)) continue;
    if (rule.unlessTerms?.some((term) => textIncludesTerm(name, term))) continue;

    for (const allergen of rule.allergens ?? []) {
      const key = `allergen:${allergen}`;
      const existing = tags.find((tag) => tag.kind === 'allergen' && tag.id === allergen);
      if (existing && existing.detection === 'detected') continue;
      if (existing && rule.detection === 'inferred') continue;
      if (existing) {
        existing.detection = rule.detection;
        existing.term = rule.term;
        continue;
      }
      if (seen.has(key) && rule.detection === 'inferred') continue;
      seen.add(key);
      tags.push({ id: allergen, kind: 'allergen', detection: rule.detection, term: rule.term });
    }

    for (const flag of rule.flags ?? []) {
      const key = `flag:${flag}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push({ id: flag, kind: 'flag', detection: rule.detection, term: rule.term });
    }
  }

  return tags;
}
