import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  blockIPEdge: vi.fn(),
}));

vi.mock('../edge', () => ({
  blockIPEdge: (...args: Parameters<typeof mocks.blockIPEdge>) =>
    mocks.blockIPEdge(...args),
}));

import {
  cascadeBackendRateLimitToProxyBan,
  isBackendRateLimitError,
} from '../backend-rate-limit';

describe('backend-rate-limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.blockIPEdge.mockResolvedValue(null);
  });

  describe('isBackendRateLimitError', () => {
    it('matches explicit 429 status values', () => {
      expect(isBackendRateLimitError({ status: 429 })).toBe(true);
    });

    it('matches Supabase auth over-request codes', () => {
      expect(isBackendRateLimitError({ code: 'over_request_rate_limit' })).toBe(
        true
      );
    });

    it('rejects unrelated errors', () => {
      expect(
        isBackendRateLimitError({ status: 401, message: 'Unauthorized' })
      ).toBe(false);
    });
  });

  describe('cascadeBackendRateLimitToProxyBan', () => {
    it('does not hard-ban a known client IP for a backend rate-limit signal', async () => {
      const result = await cascadeBackendRateLimitToProxyBan({
        endpoint: '/api/ai/chat/new',
        ipAddress: '203.0.113.10',
        source: 'database',
        userId: 'user-1',
      });

      expect(result).toBeNull();
      expect(mocks.blockIPEdge).not.toHaveBeenCalled();
    });

    it('does not hard-ban auth backend rate-limit signals', async () => {
      const result = await cascadeBackendRateLimitToProxyBan({
        endpoint: '/api/ai/chat/new',
        ipAddress: '203.0.113.10',
        source: 'auth',
        userId: 'user-1',
      });

      expect(result).toBeNull();
      expect(mocks.blockIPEdge).not.toHaveBeenCalled();
    });

    it('returns null when the client IP is unavailable', async () => {
      const result = await cascadeBackendRateLimitToProxyBan({
        endpoint: '/api/ai/chat/new',
        ipAddress: 'unknown',
        source: 'database',
        userId: 'user-1',
      });

      expect(result).toBeNull();
      expect(mocks.blockIPEdge).not.toHaveBeenCalled();
    });
  });
});
