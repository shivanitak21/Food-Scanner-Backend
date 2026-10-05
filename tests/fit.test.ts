import { describe, expect, it } from 'vitest';

import { deriveFit } from '../src/services/fit';

describe('fit status', () => {
  it('treats a missing ingredient list with no other conflict as insufficient', () => {
    expect(
      deriveFit('review', [
        { type: 'DATA_QUALITY', severity: 'MEDIUM', title: 'Ingredient list unavailable' },
      ]),
    ).toBe('INSUFFICIENT_INFORMATION');
  });

  it('keeps a real conflict ahead of missing data', () => {
    expect(
      deriveFit('avoid', [
        { type: 'DATA_QUALITY', severity: 'MEDIUM', title: 'Ingredient list unavailable' },
        { type: 'ALLERGEN', severity: 'HIGH', title: 'Milk is listed' },
      ]),
    ).toBe('DOES_NOT_FIT');
  });

  it('marks a clear product as a good fit', () => {
    expect(deriveFit('suitable', [])).toBe('GOOD_FIT');
  });
});
