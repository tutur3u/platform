import { describe, expect, it } from 'vitest';
import { formatRelativeTimestamp } from './relative-time';

describe('AI Studio relative timestamps', () => {
  const now = new Date('2026-07-30T12:00:00.000Z');

  it('formats past and future timestamps relative to a fixed clock', () => {
    expect(
      formatRelativeTimestamp('2026-07-30T11:58:00.000Z', 'en', now)?.relative
    ).toBe('2 minutes ago');
    expect(
      formatRelativeTimestamp('2026-07-30T14:00:00.000Z', 'en', now)?.relative
    ).toBe('in 2 hours');
  });

  it('uses the requested locale', () => {
    expect(
      formatRelativeTimestamp('2026-07-29T12:00:00.000Z', 'vi', now)?.relative
    ).toBe('Hôm qua');
  });

  it('preserves the canonical timestamp for accessible time markup', () => {
    expect(
      formatRelativeTimestamp('2026-07-30T11:58:00.000Z', 'en', now)?.iso
    ).toBe('2026-07-30T11:58:00.000Z');
  });

  it('rejects missing and malformed timestamps', () => {
    expect(formatRelativeTimestamp(null, 'en', now)).toBeNull();
    expect(formatRelativeTimestamp('not-a-date', 'en', now)).toBeNull();
  });
});
