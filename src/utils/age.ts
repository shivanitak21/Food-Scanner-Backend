import type { AgeGroup } from '../rules/types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ageFromDateOfBirth(value: string, today = new Date()): number | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const bornUtc = Date.UTC(year, month - 1, day);
  const probe = new Date(bornUtc);
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (bornUtc > todayUtc) return null;
  let age = today.getFullYear() - year;
  const monthDelta = today.getMonth() - (month - 1);
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < day)) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

export function ageGroupFromAge(age: number): AgeGroup {
  if (age < 1) return 'baby';
  if (age < 13) return 'child';
  if (age < 18) return 'teen';
  if (age >= 60) return 'older_adult';
  return 'adult';
}
