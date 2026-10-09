import type { AgeGroup, DietPreference } from './types';
import { uniqueStrings } from './text';
import { ageFromDateOfBirth, ageGroupFromAge } from '../utils/age';

export const HEALTH_CONDITIONS = ['diabetes', 'high_blood_pressure', 'high_cholesterol', 'other'] as const;

export type HealthCondition = (typeof HEALTH_CONDITIONS)[number];

export interface AnalysisContext {
  name: string;
  age: number | null;
  dateOfBirth: string | null;
  /** Set when the context came from a saved profile. Quick scan leaves this empty so age bands are derived. */
  ageGroup: AgeGroup | null;
  diet: DietPreference;
  dietaryPreferences: string[];
  allergies: string[];
  healthConditions: HealthCondition[];
  goals: string[];
  thingsToWatch: string[];
  /** Chip ids from the quick screen, echoed so profile setup can restore them. */
  eating: string[];
  lifeStage: string | null;
}

export interface ProfileDraft {
  dateOfBirth: string | null;
  age: number | null;
  diet: DietPreference;
  dietaryPreferences: string[];
  allergies: string[];
  limits: string[];
  goals: string[];
  notes: string | null;
  lifeStage: 'me' | 'adult' | 'child' | 'teen' | 'baby' | 'pregnancy' | 'breastfeeding' | 'senior' | 'other' | null;
  eating: string[];
}

const WATCH_LIMIT: Record<string, string | null> = {
  sugar: 'Added sugar',
  sodium: 'Sodium',
  saturated_fat: 'Saturated fat',
  calories: null,
  protein: null,
  fiber: null,
};

const GOAL_RULES: Record<string, { goals: string[]; limits: string[] }> = {
  balanced: { goals: ['Eat healthier'], limits: [] },
  more_protein: { goals: ['Increase protein'], limits: [] },
  lower_sugar: { goals: ['Manage sugar'], limits: [] },
  lower_sodium: { goals: ['Watch salt'], limits: [] },
};

const HEALTH_PROFILE: Record<HealthCondition, { limits: string[]; note: string }> = {
  diabetes: {
    limits: ['Added sugar'],
    note: 'Health consideration: watching blood sugar.',
  },
  high_blood_pressure: {
    limits: ['Sodium'],
    note: 'Health consideration: monitoring sodium.',
  },
  high_cholesterol: {
    limits: ['Saturated fat'],
    note: 'Health consideration: watching saturated fat.',
  },
  other: {
    limits: [],
    note: 'A health consideration was noted without a specific nutrient.',
  },
};

const LIFE_STAGE_FROM_GROUP: Record<AgeGroup, ProfileDraft['lifeStage']> = {
  baby: 'baby',
  child: 'child',
  teen: 'teen',
  adult: 'me',
  older_adult: 'senior',
};

export function emptyContext(): AnalysisContext {
  return {
    name: '',
    age: null,
    dateOfBirth: null,
    ageGroup: null,
    diet: 'none',
    dietaryPreferences: [],
    allergies: [],
    healthConditions: [],
    goals: [],
    thingsToWatch: [],
    eating: [],
    lifeStage: null,
  };
}

export function normalizeContext(input?: Partial<AnalysisContext> | null): AnalysisContext {
  const base = emptyContext();
  if (!input) return base;
  const diet = input.diet === 'vegan' || input.diet === 'vegetarian' ? input.diet : 'none';
  const conditions = (input.healthConditions ?? []).filter((item): item is HealthCondition =>
    HEALTH_CONDITIONS.includes(item as HealthCondition),
  );
  return {
    ...base,
    name: input.name?.trim() ?? '',
    age: typeof input.age === 'number' && input.age >= 0 && input.age <= 120 ? Math.trunc(input.age) : null,
    dateOfBirth: input.dateOfBirth ?? null,
    ageGroup: input.ageGroup ?? null,
    diet,
    dietaryPreferences: uniqueStrings(input.dietaryPreferences ?? []),
    allergies: uniqueStrings(input.allergies ?? []),
    healthConditions: conditions,
    goals: uniqueStrings(input.goals ?? []),
    thingsToWatch: uniqueStrings(input.thingsToWatch ?? []),
    eating: uniqueStrings(input.eating ?? []),
    lifeStage: input.lifeStage ?? null,
  };
}

export function contextFromProfile(profile: {
  name: string;
  age: number | null;
  dateOfBirth: string | null;
  ageGroup: AgeGroup | null;
  diet: DietPreference;
  dietaryPreferences: string[];
  allergies: string[];
  limits: string[];
  goals: string[];
  lifeStage: string | null;
}): AnalysisContext {
  return {
    name: profile.name,
    age: profile.age,
    dateOfBirth: profile.dateOfBirth,
    ageGroup: profile.ageGroup,
    diet: profile.diet,
    dietaryPreferences: profile.dietaryPreferences,
    allergies: profile.allergies,
    healthConditions: [],
    goals: profile.goals,
    thingsToWatch: profile.limits,
    eating: [],
    lifeStage: profile.lifeStage,
  };
}

export function resolvedAge(context: AnalysisContext, today = new Date()): number | null {
  if (context.ageGroup !== null && context.age !== null) return context.age;
  if (context.dateOfBirth) {
    const computed = ageFromDateOfBirth(context.dateOfBirth, today);
    if (computed !== null) return computed;
  }
  return context.age;
}

export function limitsFromContext(context: AnalysisContext): string[] {
  const fromWatch = context.thingsToWatch.flatMap((item) => {
    if (Object.prototype.hasOwnProperty.call(WATCH_LIMIT, item)) {
      const mapped = WATCH_LIMIT[item];
      return mapped ? [mapped] : [];
    }
    return [item];
  });
  const fromGoals = context.goals.flatMap((item) => GOAL_RULES[item]?.limits ?? []);
  const fromHealth = context.healthConditions.flatMap((item) => HEALTH_PROFILE[item].limits);
  return uniqueStrings([...fromWatch, ...fromGoals, ...fromHealth]);
}

export function goalsFromContext(context: AnalysisContext): string[] {
  return uniqueStrings(context.goals.flatMap((item) => GOAL_RULES[item]?.goals ?? [item]));
}

export function profileFromContext(context: AnalysisContext): {
  name: string;
  ageGroup: AgeGroup | null;
  age: number | null;
  diet: DietPreference;
  dietaryPreferences: string[];
  allergies: string[];
  limits: string[];
  goals: string[];
  lifeStage: string | null;
} {
  const age = resolvedAge(context);
  return {
    name: context.name.trim() || 'Quick check',
    ageGroup: context.ageGroup ?? (age !== null ? ageGroupFromAge(age) : null),
    age,
    diet: context.diet,
    dietaryPreferences: context.dietaryPreferences,
    allergies: context.allergies,
    limits: limitsFromContext(context),
    goals: goalsFromContext(context),
    lifeStage: context.lifeStage,
  };
}

export function profileDraftFromContext(context: AnalysisContext): ProfileDraft {
  const age = resolvedAge(context);
  const lifeStage = (context.lifeStage as ProfileDraft['lifeStage']) ?? (age !== null ? LIFE_STAGE_FROM_GROUP[ageGroupFromAge(age)] : null);
  const notes = context.healthConditions.map((item) => HEALTH_PROFILE[item].note);
  return {
    dateOfBirth: context.dateOfBirth,
    age,
    diet: context.diet,
    dietaryPreferences: context.dietaryPreferences,
    allergies: context.allergies,
    limits: limitsFromContext(context),
    goals: goalsFromContext(context).slice(0, 3),
    notes: notes.length > 0 ? notes.join(' ') : null,
    lifeStage,
    eating: context.eating,
  };
}

export function hasPersonalContext(context: AnalysisContext): boolean {
  return (
    context.age !== null ||
    Boolean(context.dateOfBirth) ||
    context.diet !== 'none' ||
    context.dietaryPreferences.length > 0 ||
    context.allergies.length > 0 ||
    context.healthConditions.length > 0 ||
    context.goals.length > 0 ||
    context.thingsToWatch.length > 0
  );
}
