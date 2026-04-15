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
  extractIPFromRequest,
  recordMalformedAuthCookieEdge,
  recordSuspiciousApiRequestEdge,
} from '../edge';

describe('abuse-protection edge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    vi.clearAllMocks();
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
