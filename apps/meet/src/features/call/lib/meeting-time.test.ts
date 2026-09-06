import { describe, expect, it } from 'vitest';
import { normalizeMeetingTime } from './meeting-time';

describe('meeting schedule submission', () => {
  it('converts a local picker value to an absolute ISO instant', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Asia/Ho_Chi_Minh';
      expect(normalizeMeetingTime('2026-09-06T17:30')).toBe(
        '2026-09-06T10:30:00.000Z'
      );
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
  it('preserves an existing absolute instant', () => {
    expect(normalizeMeetingTime('2026-09-06T10:30:00Z')).toBe(
      '2026-09-06T10:30:00.000Z'
    );
  });
});
