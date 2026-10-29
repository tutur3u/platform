// @vitest-environment node
import { timingSafeEqual } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', async () => {
  const actual =
    await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

import { timingSafeStringEqual } from './timing-safe-string-equal';

beforeEach(() => vi.clearAllMocks());

describe('timingSafeStringEqual', () => {
  it.each<[string, string, boolean]>([
    ['Bearer fixture', 'Bearer fixture', true],
    ['', '', true],
    ['', 'Bearer fixture', false],
    ['Bearer wrong', 'Bearer fixture', false],
    ['Bearer fixture ', 'Bearer fixture', false],
    ['Bearer é', 'Bearer e', false],
  ])('compares %j and %j exactly', (actual, expected, matches) => {
    expect(timingSafeStringEqual(actual, expected)).toBe(matches);
    expect(timingSafeEqual).toHaveBeenCalledOnce();
    const [left, right] = vi.mocked(timingSafeEqual).mock.calls[0] ?? [];
    expect(left).toHaveLength(32);
    expect(right).toHaveLength(32);
  });
});
