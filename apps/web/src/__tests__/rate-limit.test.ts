import { describe, expect, it, vi } from 'vitest';

// Mock Redis — return null to force in-memory fallback
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: vi.fn(() => null) },
}));

import {
  checkRateLimit,
  checkRateLimitMemory,
  type RateLimitConfig,
} from '../lib/rate-limit';

describe('checkRateLimitMemory', () => {
  const config: RateLimitConfig = {
    windowMs: 60000,
    maxRequests: 3,
  };

  it('should allow first request', () => {
    const result = checkRateLimitMemory('test:first', config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.limit).toBe(3);
  });

  it('should decrement remaining on each request', () => {
    const key = 'test:decrement';
    const r1 = checkRateLimitMemory(key, config);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimitMemory(key, config);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimitMemory(key, config);
    expect(r3.remaining).toBe(0);
    expect(r3.allowed).toBe(true);
  });

  it('should deny requests after limit is exceeded', () => {
    const key = 'test:exceeded';
    // Exhaust the limit
    for (let i = 0; i < config.maxRequests; i++) {
      checkRateLimitMemory(key, config);
    }

    const denied = checkRateLimitMemory(key, config);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it('should use separate keys for different identifiers', () => {
    const r1 = checkRateLimitMemory('user:alice', config);
    const r2 = checkRateLimitMemory('user:bob', config);

    // Both should have full budgets
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(2);
  });

  it('should reset after window expires', () => {
    const key = 'test:reset';
    vi.useFakeTimers();

    // Exhaust the limit
    for (let i = 0; i < config.maxRequests; i++) {
      checkRateLimitMemory(key, config);
    }
    const denied = checkRateLimitMemory(key, config);
    expect(denied.allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(config.windowMs + 1);

    const allowed = checkRateLimitMemory(key, config);
    expect(allowed.allowed).toBe(true);
    expect(allowed.remaining).toBe(2);

    vi.useRealTimers();
  });

  it('should respect different configs for different limits', () => {
    const strictConfig: RateLimitConfig = { windowMs: 60000, maxRequests: 1 };
    const lenientConfig: RateLimitConfig = {
      windowMs: 60000,
      maxRequests: 100,
    };

    const r1 = checkRateLimitMemory('strict:key', strictConfig);
    expect(r1.allowed).toBe(true);

    const r2 = checkRateLimitMemory('strict:key', strictConfig);
    expect(r2.allowed).toBe(false);

    const r3 = checkRateLimitMemory('lenient:key', lenientConfig);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(99);
  });

  it('should set reset timestamp in the future', () => {
    const now = Math.floor(Date.now() / 1000);
    const result = checkRateLimitMemory('test:timestamp', config);
    expect(result.reset).toBeGreaterThanOrEqual(now);
  });
});

describe('rate-limit key separation for method-aware limiting', () => {
  const readConfig: RateLimitConfig = { windowMs: 60000, maxRequests: 60 };
  const mutateConfig: RateLimitConfig = { windowMs: 60000, maxRequests: 20 };

  it('should track read and mutate budgets independently', () => {
    const ip = '192.168.1.1';
    const readKey = `session:ip:read:${ip}`;
    const mutateKey = `session:ip:mutate:${ip}`;

    // Exhaust mutate budget
    for (let i = 0; i < mutateConfig.maxRequests; i++) {
      checkRateLimitMemory(mutateKey, mutateConfig);
    }
    const mutateDenied = checkRateLimitMemory(mutateKey, mutateConfig);
    expect(mutateDenied.allowed).toBe(false);

    // Read budget should still be full
    const readAllowed = checkRateLimitMemory(readKey, readConfig);
    expect(readAllowed.allowed).toBe(true);
    expect(readAllowed.remaining).toBe(59);
  });

  it('should allow 60 reads but only 20 mutations per window', () => {
    const ip = '10.0.0.1';
    const readKey = `session:ip:read:${ip}`;
    const mutateKey = `session:ip:mutate:${ip}`;

    // 60 reads should all be allowed
    for (let i = 0; i < 60; i++) {
      const r = checkRateLimitMemory(readKey, readConfig);
      expect(r.allowed).toBe(true);
    }
    // 61st read should be denied
    expect(checkRateLimitMemory(readKey, readConfig).allowed).toBe(false);

    // 20 mutations should all be allowed
    for (let i = 0; i < 20; i++) {
      const r = checkRateLimitMemory(mutateKey, mutateConfig);
      expect(r.allowed).toBe(true);
    }
    // 21st mutation should be denied
    expect(checkRateLimitMemory(mutateKey, mutateConfig).allowed).toBe(false);
  });
});

describe('checkRateLimit adaptive multipliers', () => {
  it('applies trust multiplier before checking the budget', async () => {
    const key = 'test:adaptive-multiplier';
    const config: RateLimitConfig = {
      maxRequests: 2,
      maxRequestsMultiplier: 3,
      windowMs: 60000,
    };

    for (let i = 0; i < 6; i++) {
      await expect(checkRateLimit(key, config)).resolves.toMatchObject({
        allowed: true,
      });
    }

    const denied = await checkRateLimit(key, config);
    const deniedResponse = denied as Response;

    expect(deniedResponse.status).toBe(429);
    expect(deniedResponse.headers.get('X-RateLimit-Limit')).toBe('6');
  });

  it('falls back to at least one request for restrictive multipliers', async () => {
    const key = 'test:restrictive-multiplier';
    const config: RateLimitConfig = {
      maxRequests: 2,
      maxRequestsMultiplier: 0.1,
      windowMs: 60000,
    };

    await expect(checkRateLimit(key, config)).resolves.toMatchObject({
      allowed: true,
    });

    const denied = await checkRateLimit(key, config);
    const deniedResponse = denied as Response;

    expect(deniedResponse.status).toBe(429);
    expect(deniedResponse.headers.get('X-RateLimit-Limit')).toBe('1');
  });
});
