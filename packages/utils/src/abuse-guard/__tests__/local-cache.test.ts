// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createExpiringMap, createLocalWindowLimiter } from '../local-cache';

describe('createExpiringMap', () => {
  it('expires entries and stays within its bound', () => {
    const map = createExpiringMap<number>(2);
    map.set('a', 1, 1000);
    expect(map.get('a', 999)).toBe(1);
    expect(map.get('a', 1000)).toBeUndefined();
    map.set('a', 1, 5000);
    map.set('b', 2, 5000);
    map.set('c', 3, 5000);
    expect(map.size).toBe(2);
    expect(map.get('a', 0)).toBeUndefined();
    expect(map.get('c', 0)).toBe(3);
  });
});

describe('createLocalWindowLimiter', () => {
  it('is all-or-nothing and resets per window', () => {
    const limiter = createLocalWindowLimiter();
    const windows = [
      { key: 'm', limit: 2, windowMs: 60_000 },
      { key: 'h', limit: 3, windowMs: 3_600_000 },
    ];
    expect(limiter.hit(windows, 0)).toBeNull();
    expect(limiter.hit(windows, 1)).toBeNull();
    expect(limiter.hit(windows, 2)).toMatchObject({
      window: { key: 'm' },
      resetAt: 60_000,
    });
    // The denied hit charged nothing: the hour window still has one unit.
    expect(limiter.hit(windows, 60_000)).toBeNull();
    expect(limiter.hit(windows, 60_001)).toMatchObject({
      window: { key: 'h' },
    });
  });
});
