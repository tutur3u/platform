import { describe, expect, it } from 'vitest';
import { EmailRateLimiter } from '../protection/rate-limiter';
import type { EmailMetadata } from '../types';

describe('EmailRateLimiter', () => {
  it('should allow emails within limit', async () => {
    const limiter = new EmailRateLimiter({
      workspacePerMinute: 10,
    });
    const metadata: EmailMetadata = { wsId: 'ws-1' };

    const result = await limiter.checkRateLimits(metadata);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeLessThanOrEqual(10);
  });

  it('should block emails exceeding limit', async () => {
    const limiter = new EmailRateLimiter({
      workspacePerMinute: 1,
    });
    const metadata: EmailMetadata = { wsId: 'ws-blocked' };

    // Simulate sending one email
    await limiter.incrementCounters(metadata, ['test1@example.com']);

    // Check next email -> Should be blocked
    const result = await limiter.checkRateLimits(metadata);

    expect(result.allowed).toBe(false);
    // limitType might be 'workspace_minute' or similar
    expect(result.limitType).toBeDefined();
    expect(result.limit).toBe(1);
    expect(result.usage).toBeGreaterThanOrEqual(1);
  });
});
