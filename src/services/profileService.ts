import mongoose from 'mongoose';

import { Profile } from '../models/Profile';
import { uniqueStrings } from '../rules/text';
import type { AgeGroup, DietPreference, HealthInterpretation } from '../rules/types';
import { ageFromDateOfBirth, ageGroupFromAge } from '../utils/age';
import { NotFoundError } from '../utils/errors';

const AGE_GROUPS: AgeGroup[] = ['baby', 'child', 'teen', 'adult', 'older_adult'];
const DIETS: DietPreference[] = ['none', 'vegetarian', 'vegan'];

export interface ProfileInput {
  name: string;
  role: 'self' | 'adult' | 'child' | 'baby' | 'other';
  ageGroup: AgeGroup | null;
  age: number | null;
  dateOfBirth: string | null;
  diet: DietPreference;
  dietaryPreferences: string[];
  allergies: string[];
  limits: string[];
  notes: string | null;
  goals: string[];
  lifeStage: 'me' | 'adult' | 'child' | 'teen' | 'baby' | 'pregnancy' | 'breastfeeding' | 'senior' | 'other' | null;
  isPrimary: boolean;
}

export interface StoredBiomarker {
  name: string;
  value: number | null;
  unit: string | null;
  interpretation: HealthInterpretation | null;
  date: string | null;
  confirmedByUser: boolean;
}

export interface StoredRecommendation {
  recommendation: string;
  source: string | null;
  confirmedByUser: boolean;
}

export interface HealthContextView {
  enabled: boolean;
  paused: boolean;
  biomarkers: StoredBiomarker[];
  dietaryRecommendations: StoredRecommendation[];
  reportCount: number;
}

export interface ProfileView extends ProfileInput {
  id: string;
  healthContext: HealthContextView;
}

export class ProfileService {
  async list(userId: string): Promise<ProfileView[]> {
    const profiles = await Profile.find({ userId }).sort({ isPrimary: -1, createdAt: 1 });
    return profiles.map(toView);
  }

  async create(userId: string, input: ProfileInput): Promise<ProfileView> {
    const count = await Profile.countDocuments({ userId });
    const isPrimary = count === 0 || input.isPrimary;
    if (isPrimary) await Profile.updateMany({ userId }, { isPrimary: false });
    const profile = await Profile.create({ ...normalize(input), userId, isPrimary });
    return toView(profile);
  }

  async update(userId: string, profileId: string, input: ProfileInput): Promise<ProfileView> {
    const profile = await this.owned(userId, profileId);
    const others = await Profile.countDocuments({ userId, _id: { $ne: profile._id }, isPrimary: true });
    const isPrimary = input.isPrimary || others === 0;
    if (isPrimary) await Profile.updateMany({ userId, _id: { $ne: profile._id } }, { isPrimary: false });
    profile.set({ ...normalize(input), isPrimary });
    await profile.save();
    return toView(profile);
  }

  async remove(userId: string, profileId: string): Promise<void> {
    const profile = await this.owned(userId, profileId);
    const wasPrimary = profile.isPrimary;
    await profile.deleteOne();
    if (wasPrimary) {
      const replacement = await Profile.findOne({ userId }).sort({ updatedAt: -1 });
      if (replacement) {
        replacement.isPrimary = true;
        await replacement.save();
      }
    }
  }

  async require(userId: string, profileId: string): Promise<ProfileView> {
    return toView(await this.owned(userId, profileId));
  }

  async saveHealthContext(userId: string, profileId: string, input: HealthContextView): Promise<ProfileView> {
    const profile = await this.owned(userId, profileId);
    const biomarkers = input.biomarkers.filter((item) => item.confirmedByUser && item.name.trim());
    const dietaryRecommendations = input.dietaryRecommendations.filter((item) => item.confirmedByUser && item.recommendation.trim());
    profile.set('healthContext', {
      enabled: input.enabled && (biomarkers.length > 0 || dietaryRecommendations.length > 0),
      paused: input.paused,
      biomarkers,
      dietaryRecommendations,
      reports:
        biomarkers.length + dietaryRecommendations.length > 0
          ? [{ id: new mongoose.Types.ObjectId().toString(), type: 'lab', uploadedAt: new Date(), status: 'confirmed' }]
          : [],
    });
    profile.markModified('healthContext');
    await profile.save();
    return toView(profile);
  }

  async clearHealthContext(userId: string, profileId: string): Promise<ProfileView> {
    const profile = await this.owned(userId, profileId);
    profile.set('healthContext', { enabled: false, paused: false, biomarkers: [], dietaryRecommendations: [], reports: [] });
    profile.markModified('healthContext');
    await profile.save();
    return toView(profile);
  }

  private async owned(userId: string, profileId: string) {
    if (!mongoose.isValidObjectId(profileId)) throw new NotFoundError('Profile not found.');
    const profile = await Profile.findOne({ _id: profileId, userId });
    if (!profile) throw new NotFoundError('Profile not found.');
    return profile;
  }
}

function normalize(input: ProfileInput) {
  const resolved = resolveAge(input);
  return {
    name: input.name.trim(),
    role: input.role,
    ageGroup: resolved.ageGroup,
    age: resolved.age,
    dateOfBirth: resolved.dateOfBirth,
    diet: input.diet,
    dietaryPreferences: uniqueStrings(input.dietaryPreferences).slice(0, 40),
    allergies: uniqueStrings(input.allergies).slice(0, 40),
    limits: uniqueStrings(input.limits).slice(0, 40),
    notes: input.notes?.trim() ? input.notes.trim() : null,
    goals: uniqueStrings(input.goals ?? []).slice(0, 3),
    lifeStage: input.lifeStage || undefined,
  };
}

function toView(profile: {
  _id: mongoose.Types.ObjectId;
  name: string;
  role: string;
  ageGroup?: string | null;
  age?: number | null;
  dateOfBirth?: string | null;
  diet: string;
  dietaryPreferences?: string[];
  allergies?: string[];
  limits?: string[];
  notes?: string | null;
  goals?: string[];
  lifeStage?: ProfileView['lifeStage'];
  isPrimary: boolean;
  healthContext?: unknown;
}): ProfileView {
  const storedGroup = AGE_GROUPS.find((group) => group === profile.ageGroup) ?? null;
  const resolved = resolveAge({
    dateOfBirth: profile.dateOfBirth ?? null,
    age: typeof profile.age === 'number' ? profile.age : null,
    ageGroup: storedGroup,
  });
  return {
    id: String(profile._id),
    name: profile.name,
    role: profile.role as ProfileView['role'],
    ageGroup: resolved.ageGroup,
    age: resolved.age,
    dateOfBirth: resolved.dateOfBirth,
    diet: DIETS.find((diet) => diet === profile.diet) ?? 'none',
    dietaryPreferences: profile.dietaryPreferences ?? [],
    allergies: profile.allergies ?? [],
    limits: profile.limits ?? [],
    notes: profile.notes ?? null,
    goals: profile.goals ?? [],
    lifeStage: profile.lifeStage ?? null,
    isPrimary: profile.isPrimary,
    healthContext: toHealth(profile.healthContext),
  };
}

function resolveAge(input: { dateOfBirth: string | null; age: number | null; ageGroup: AgeGroup | null }): {
  dateOfBirth: string | null;
  age: number | null;
  ageGroup: AgeGroup | null;
} {
  const dateOfBirth = input.dateOfBirth?.trim() ? input.dateOfBirth.trim() : null;
  const computed = dateOfBirth ? ageFromDateOfBirth(dateOfBirth) : null;
  if (computed === null) {
    return { dateOfBirth, age: input.age, ageGroup: input.ageGroup };
  }
  return { dateOfBirth, age: computed, ageGroup: ageGroupFromAge(computed) };
}

function toHealth(value: unknown): HealthContextView {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const biomarkers = (Array.isArray(record.biomarkers) ? record.biomarkers : [])
    .map((item) => (item && typeof item === 'object' ? (item as StoredBiomarker) : null))
    .filter((item): item is StoredBiomarker => Boolean(item?.confirmedByUser && item.name));
  const dietaryRecommendations = (Array.isArray(record.dietaryRecommendations) ? record.dietaryRecommendations : [])
    .map((item) => (item && typeof item === 'object' ? (item as StoredRecommendation) : null))
    .filter((item): item is StoredRecommendation => Boolean(item?.confirmedByUser && item.recommendation));
  return {
    enabled: Boolean(record.enabled) && (biomarkers.length > 0 || dietaryRecommendations.length > 0),
    paused: Boolean(record.paused),
    biomarkers,
    dietaryRecommendations,
    reportCount: Array.isArray(record.reports) ? record.reports.length : 0,
  };
}

export const profileService = new ProfileService();
