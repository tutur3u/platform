import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRedis: vi.fn(),
  redis: {
    expire: vi.fn(),
    get: vi.fn(),
    incr: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../../upstash-rest', () => ({
  getUpstashRestRedisClient: () => mocks.getRedis(),
}));

import {
  blockIPEdge,
  clearEdgeAbuseProtectionControlsCache,
  EDGE_ABUSE_PROTECTION_CONTROLS_REDIS_KEY,
  extractIPFromRequest,
  isIPBlockedEdge,
  recordMalformedAuthCookieEdge,
  recordSuspiciousApiRequestEdge,
} from '../edge';

describe('abuse-protection edge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    vi.clearAllMocks();
    clearEdgeAbuseProtectionControlsCache();
    mocks.getRedis.mockResolvedValue(mocks.redis);
    mocks.redis.expire.mockResolvedValue(1);
    mocks.redis.get.mockResolvedValue(0);
    mocks.redis.incr.mockResolvedValue(1);
    mocks.redis.set.mockResolvedValue('OK');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('extractIPFromRequest', () => {
    it('prefers cf-connecting-ip over x-forwarded-for', () => {
      const headers = new Headers();
      headers.set('cf-connecting-ip', '203.0.113.10');
      headers.set('x-forwarded-for', '198.51.100.10, 10.0.0.1');

      expect(extractIPFromRequest(headers)).toBe('203.0.113.10');
    });

    it('falls back to true-client-ip before generic proxy headers', () => {
      const headers = new Headers();
      headers.set('true-client-ip', '203.0.113.20');
      headers.set('x-forwarded-for', '198.51.100.20, 10.0.0.1');

      expect(extractIPFromRequest(headers)).toBe('203.0.113.20');
    });

    it('falls back to x-forwarded-for when cloud proxy headers are absent', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '198.51.100.30, 10.0.0.1');

      expect(extractIPFromRequest(headers)).toBe('198.51.100.30');
    });
  });

  describe('edge abuse protection controls', () => {
    it('does not enforce cached IP blocks when IP blocking is disabled', async () => {
      mocks.redis.get.mockImplementation((key: string) => {
        if (key === EDGE_ABUSE_PROTECTION_CONTROLS_REDIS_KEY) {
          return Promise.resolve(
            JSON.stringify({
              ipBlockingEnabled: false,
              rateLimitsEnabled: true,
            })
          );
        }

        return Promise.resolve(
          JSON.stringify({
            id: 'block-1',
            level: 2,
            reason: 'api_abuse',
            blockedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          })
        );
      });

      const blockInfo = await isIPBlockedEdge('203.0.113.40');

      expect(blockInfo).toBeNull();
      expect(mocks.redis.get).toHaveBeenCalledWith(
        EDGE_ABUSE_PROTECTION_CONTROLS_REDIS_KEY
      );
      expect(mocks.redis.get).not.toHaveBeenCalledWith(
        'ip:blocked:203.0.113.40'
      );
    });

    it('does not create edge IP blocks when IP blocking is disabled', async () => {
      mocks.redis.get.mockImplementation((key: string) => {
        if (key === EDGE_ABUSE_PROTECTION_CONTROLS_REDIS_KEY) {
          return Promise.resolve(
            JSON.stringify({
              ipBlockingEnabled: false,
              rateLimitsEnabled: true,
            })
          );
        }

        return Promise.resolve(0);
      });

      const blockInfo = await blockIPEdge('203.0.113.50', 'api_abuse');

      expect(blockInfo).toBeNull();
      expect(mocks.redis.set).not.toHaveBeenCalled();
    });
  });

  describe('recordMalformedAuthCookieEdge', () => {
    it('tracks malformed-cookie hits without blocking on the first offense', async () => {
      mocks.redis.incr.mockResolvedValueOnce(1);

      const blockInfo = await recordMalformedAuthCookieEdge('203.0.113.10');

      expect(blockInfo).toBeNull();
      expect(mocks.redis.expire).toHaveBeenCalledWith(
        'api:auth:malformed-cookie:203.0.113.10',
        60
      );
      expect(mocks.redis.set).not.toHaveBeenCalledWith(
        'ip:blocked:203.0.113.10',
        expect.anything(),
        expect.anything()
      );
    });

    it('escalates repeated malformed-cookie hits into an IP block', async () => {
      mocks.redis.incr.mockResolvedValueOnce(3);
      mocks.redis.get.mockResolvedValueOnce(0);

      const blockInfo = await recordMalformedAuthCookieEdge('203.0.113.10');

      expect(blockInfo?.blockLevel).toBe(1);
      expect(blockInfo?.reason).toBe('api_abuse');
      expect(mocks.redis.set).toHaveBeenCalledWith(
        'ip:blocked:203.0.113.10',
        expect.any(String),
        expect.objectContaining({ ex: 300 })
      );
      expect(mocks.redis.set).toHaveBeenCalledWith(
        'ip:block:level:203.0.113.10',
        1,
        expect.objectContaining({ ex: 86400 })
      );
    });
  });

  describe('recordSuspiciousApiRequestEdge', () => {
    it('tracks suspicious anonymous hits without blocking on the first offense', async () => {
      mocks.redis.incr.mockResolvedValueOnce(1);

      const blockInfo = await recordSuspiciousApiRequestEdge('203.0.113.20');

      expect(blockInfo).toBeNull();
      expect(mocks.redis.expire).toHaveBeenCalledWith(
        'api:suspicious:203.0.113.20',
        60
      );
      expect(mocks.redis.set).not.toHaveBeenCalledWith(
        'ip:blocked:203.0.113.20',
        expect.anything(),
        expect.anything()
      );
    });

    it('escalates repeated suspicious anonymous hits into an IP block', async () => {
      mocks.redis.incr.mockResolvedValueOnce(3);
      mocks.redis.get.mockResolvedValueOnce(0);

      const blockInfo = await recordSuspiciousApiRequestEdge('203.0.113.20');

      expect(blockInfo?.blockLevel).toBe(1);
      expect(blockInfo?.reason).toBe('api_abuse');
      expect(mocks.redis.set).toHaveBeenCalledWith(
        'ip:blocked:203.0.113.20',
        expect.any(String),
        expect.objectContaining({ ex: 300 })
      );
    });
  });
});
