import { describe, expect, it } from 'vitest';
import {
  resetTimestamp,
  windowKind,
} from '../src/collectors/codex-rate-limits';

describe('shared Codex rate limit normalization', () => {
  it('rejects non-positive numeric resets and normalizes valid timestamps', () => {
    expect(resetTimestamp(0)).toBeUndefined();
    expect(resetTimestamp(-1)).toBeUndefined();
    expect(resetTimestamp('not a date')).toBeUndefined();
    expect(resetTimestamp('2026-10-23T01:02:03Z')).toBe(
      '2026-10-23T01:02:03.000Z'
    );
    expect(resetTimestamp(1_900_000_000)).toBe(
      new Date(1_900_000_000_000).toISOString()
    );
  });

  it('maps the same duration boundaries for app-server and session events', () => {
    expect(windowKind(1440, 1)).toBe('short');
    expect(windowKind(1441, 0)).toBe('long');
    expect(windowKind(undefined, 0)).toBe('short');
    expect(windowKind(undefined, 1)).toBe('long');
  });
});
