import { describe, expect, it } from 'vitest';
import { normalizeMeetingTime } from './meeting-time';

describe('meeting schedule submission', () => {
  it('converts a local picker value to an absolute ISO instant', () => {
    const localInstant = new Date(2026, 8, 6, 17, 30);
    expect(normalizeMeetingTime('2026-09-06T17:30')).toBe(
      localInstant.toISOString()
    );
  });
  it('preserves an existing absolute instant', () => {
    expect(normalizeMeetingTime('2026-09-06T10:30:00Z')).toBe(
      '2026-09-06T10:30:00.000Z'
    );
  });
});
