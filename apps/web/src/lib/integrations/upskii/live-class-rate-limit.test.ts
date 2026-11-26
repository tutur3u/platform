import { describe, expect, it, vi } from 'vitest';
import type { AccountLinkRoute } from './rate-limit';

const counts = vi.hoisted(() => new Map<string, number>());
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitRedis: async (key: string, config: { maxRequests: number }) => {
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    return {
      allowed: next <= config.maxRequests,
      limit: config.maxRequests,
      reset: Math.floor(Date.now() / 1000) + 60,
    };
  },
}));
vi.mock('@/lib/external-apps/exchange-rate-limit', () => ({
  secretKeyPart: () => 'test-secret-digest',
}));

const {
  admitAccountLinkRequest,
  limitLiveClassStatus,
  limitVerifiedAccountLinkRequest,
} = await import('./rate-limit');
const appId = 'upskii';
const beforeCredentials = (route: AccountLinkRoute) =>
  admitAccountLinkRequest({
    appId,
    appSecret: 'test-secret',
    ip: '198.51.100.7',
    route,
  });

describe('live class budgets', () => {
  it('admits 240 class requests and another class from shared egress while preserving the teacher lane', async () => {
    const status = async (classId: string) =>
      (await beforeCredentials('live-class-status')) ??
      (await limitVerifiedAccountLinkRequest({
        appId,
        route: 'live-class-status',
      })) ??
      (await limitLiveClassStatus(classId));

    const students = await Promise.all(
      Array.from({ length: 290 }, (_, index) =>
        status(index < 240 ? 'class-a' : 'class-b')
      )
    );
    expect(students.every((response) => response === null)).toBe(true);
    expect((await status('class-a'))?.status).toBe(429);
    expect(await beforeCredentials('live-class')).toBeNull();
    for (let call = 0; call < 10; call++) {
      expect(
        await limitVerifiedAccountLinkRequest({
          appId,
          route: 'live-class',
          userId: 'teacher-a',
        })
      ).toBeNull();
    }
    expect(
      (
        await limitVerifiedAccountLinkRequest({
          appId,
          route: 'live-class',
          userId: 'teacher-a',
        })
      )?.status
    ).toBe(429);
  });
});
