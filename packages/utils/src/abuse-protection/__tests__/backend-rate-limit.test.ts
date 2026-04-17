import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  blockIPEdge: vi.fn(),
  checkUserSuspension: vi.fn(),
  suspendUser: vi.fn(),
}));

vi.mock('../edge', () => ({
  blockIPEdge: (...args: Parameters<typeof mocks.blockIPEdge>) =>
    mocks.blockIPEdge(...args),
}));

vi.mock('../user-suspension', () => ({
  checkUserSuspension: (
    ...args: Parameters<typeof mocks.checkUserSuspension>
  ) => mocks.checkUserSuspension(...args),
  suspendUser: (...args: Parameters<typeof mocks.suspendUser>) =>
    mocks.suspendUser(...args),
}));

import {
  cascadeBackendRateLimitToProxyBan,
  isBackendRateLimitError,
} from '../backend-rate-limit';

describe('backend-rate-limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.blockIPEdge.mockResolvedValue(null);
    mocks.checkUserSuspension.mockResolvedValue({ suspended: false });
    mocks.suspendUser.mockResolvedValue(true);
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
    it('blocks the IP and suspends an identified user', async () => {
      const blockInfo = {
        id: 'block-1',
        blockLevel: 1,
        reason: 'api_abuse',
        blockedAt: new Date(),
        expiresAt: new Date(Date.now() + 300_000),
      };
      mocks.blockIPEdge.mockResolvedValue(blockInfo);

      const result = await cascadeBackendRateLimitToProxyBan({
        endpoint: '/api/ai/chat/new',
        ipAddress: '203.0.113.10',
        source: 'database',
        userId: 'user-1',
      });

      expect(result).toBe(blockInfo);
      expect(mocks.blockIPEdge).toHaveBeenCalledWith(
        '203.0.113.10',
        'api_abuse'
      );
      expect(mocks.checkUserSuspension).toHaveBeenCalledWith('user-1');
      expect(mocks.suspendUser).toHaveBeenCalledWith(
        'user-1',
        'Automatic suspension for API abuse after database rate limiting on /api/ai/chat/new.',
        null
      );
    });

    it('does not create duplicate suspensions for already banned users', async () => {
      mocks.checkUserSuspension.mockResolvedValue({
        suspended: true,
        reason: 'already suspended',
      });

      await cascadeBackendRateLimitToProxyBan({
        endpoint: '/api/ai/chat/new',
        ipAddress: '203.0.113.10',
        source: 'auth',
        userId: 'user-1',
      });

      expect(mocks.suspendUser).not.toHaveBeenCalled();
      expect(mocks.blockIPEdge).toHaveBeenCalledWith(
        '203.0.113.10',
        'api_abuse'
      );
    });

    it('still suspends the user when the client IP is unavailable', async () => {
      await cascadeBackendRateLimitToProxyBan({
        endpoint: '/api/ai/chat/new',
        ipAddress: 'unknown',
        source: 'database',
        userId: 'user-1',
      });

      expect(mocks.blockIPEdge).not.toHaveBeenCalled();
      expect(mocks.suspendUser).toHaveBeenCalledTimes(1);
    });
  });
});
