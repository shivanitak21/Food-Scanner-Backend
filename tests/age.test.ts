import { describe, expect, it } from 'vitest';

import { profileSchema } from '../src/middleware/schemas';
import { ageFromDateOfBirth, ageGroupFromAge } from '../src/utils/age';

describe('age from date of birth', () => {
  const today = new Date(2026, 9, 7);

  it('calculates a completed age and ignores a future date', () => {
    expect(ageFromDateOfBirth('2018-10-07', today)).toBe(8);
    expect(ageFromDateOfBirth('2018-10-08', today)).toBe(7);
    expect(ageFromDateOfBirth('2026-10-08', today)).toBeNull();
    expect(ageFromDateOfBirth('2018-02-31', today)).toBeNull();
  });

  it('maps age to a group without replacing an explicit life stage', () => {
    expect(ageGroupFromAge(0)).toBe('baby');
    expect(ageGroupFromAge(8)).toBe('child');
    expect(ageGroupFromAge(16)).toBe('teen');
    expect(ageGroupFromAge(34)).toBe('adult');
    expect(ageGroupFromAge(68)).toBe('older_adult');
  });

  it('keeps date of birth optional on the profile payload', () => {
    const parsed = profileSchema.parse({
      name: 'Aria',
      role: 'adult',
      ageGroup: 'adult',
      age: 30,
      diet: 'none',
      dietaryPreferences: [],
      allergies: [],
      limits: [],
      notes: null,
      isPrimary: false,
    });
    expect(parsed.dateOfBirth).toBeNull();
    expect(
      profileSchema.safeParse({
        name: 'Aria',
        role: 'adult',
        ageGroup: null,
        age: null,
        dateOfBirth: '2027-01-01',
        diet: 'none',
        dietaryPreferences: [],
        allergies: [],
        limits: [],
        notes: null,
        isPrimary: false,
      }).success,
    ).toBe(false);
  });
});