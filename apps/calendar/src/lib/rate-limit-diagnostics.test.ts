// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  hasUpstashRestEnv: () => false,
  getUpstashRestRedisClient: vi.fn(),
}));

import {
  checkRateLimit,
  resetRateLimitMemoryStoreForTests,
} from './rate-limit';

beforeEach(() => resetRateLimitMemoryStoreForTests());

it.each(['ip', 'user'])(
  'names the actual session %s quota and retry window',
  async (scope) => {
    const key = `session:${scope}:mutate:private-identity`;
    const config = { windowMs: 60000, maxRequests: 1 };
    expect(await checkRateLimit(key, config)).toHaveProperty('allowed', true);
    const response = await checkRateLimit(key, config);
    if ('allowed' in response)
      throw new Error('Expected the real quota to reject');
    expect(response.status).toBe(429);
    expect(response.headers.get('x-proxy-block-reason')).toBe(
      'rate-limit-exceeded'
    );
    expect(response.headers.get('x-ratelimit-policy')).toBe(
      `calendar-session-${scope}-mutate`
    );
    expect(response.headers.get('x-ratelimit-window')).toBe('minute');
    expect(response.headers.get('retry-after')).toMatch(/^[1-9]\d*$/);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(
      JSON.stringify([...response.headers]) + (await response.text())
    ).not.toContain('private-identity');
  }
);

it('never publishes unrecognized session key segments as diagnostic metadata', async () => {
  const key = 'session:private-identity:private-route';
  const config = { windowMs: 2345, maxRequests: 1 };
  await checkRateLimit(key, config);
  const response = await checkRateLimit(key, config);
  if ('allowed' in response) throw new Error('Expected quota rejection');
  expect(response.headers.get('x-ratelimit-policy')).toBe(
    'calendar-route-quota'
  );
  expect(response.headers.get('x-ratelimit-caller-class')).toBe('unknown');
  expect(response.headers.get('x-ratelimit-window')).toBe('unknown');
  expect(JSON.stringify([...response.headers])).not.toContain('private-');
});
