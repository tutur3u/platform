import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ isIPBlocked: vi.fn() }));
vi.mock('../index', () => ({
  isIPBlocked: (...args: unknown[]) => mocks.isIPBlocked(...args),
}));

import {
  isIPBlockedReusingRecentClear,
  RECENT_IP_CLEAR_TTL_MS,
  resetRecentIpClears,
} from '../recent-ip-block';

const { isIPBlocked } = mocks;

const block = {
  id: 'block-1',
  blockLevel: 1,
  reason: 'api_abuse',
  expiresAt: new Date(Date.now() + 60_000),
  blockedAt: new Date(),
};

describe('isIPBlockedReusingRecentClear', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRecentIpClears();
    isIPBlocked.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reuses a clean lookup for the same IP within the window', async () => {
    isIPBlocked.mockResolvedValue(null);
    await expect(
      isIPBlockedReusingRecentClear('203.0.113.1')
    ).resolves.toBeNull();
    await expect(
      isIPBlockedReusingRecentClear('203.0.113.1')
    ).resolves.toBeNull();
    expect(isIPBlocked).toHaveBeenCalledTimes(1);

    await isIPBlockedReusingRecentClear('203.0.113.2');
    expect(isIPBlocked).toHaveBeenCalledTimes(2);
  });

  it('looks again once the window passes', async () => {
    isIPBlocked.mockResolvedValueOnce(null).mockResolvedValueOnce(block);
    await isIPBlockedReusingRecentClear('203.0.113.3');
    vi.advanceTimersByTime(RECENT_IP_CLEAR_TTL_MS + 1);
    await expect(isIPBlockedReusingRecentClear('203.0.113.3')).resolves.toEqual(
      block
    );
  });

  it('always reads the shared unknown bucket', async () => {
    isIPBlocked.mockResolvedValue(null);
    await isIPBlockedReusingRecentClear('unknown');
    await isIPBlockedReusingRecentClear('unknown');
    expect(isIPBlocked).toHaveBeenCalledTimes(2);
  });

  it('never reuses a block', async () => {
    isIPBlocked.mockResolvedValue(block);
    await expect(isIPBlockedReusingRecentClear('203.0.113.4')).resolves.toEqual(
      block
    );
    await expect(isIPBlockedReusingRecentClear('203.0.113.4')).resolves.toEqual(
      block
    );
    expect(isIPBlocked).toHaveBeenCalledTimes(2);
  });

  it('does not remember a lookup that failed', async () => {
    isIPBlocked
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(null);
    await expect(isIPBlockedReusingRecentClear('203.0.113.5')).rejects.toThrow(
      'offline'
    );
    await isIPBlockedReusingRecentClear('203.0.113.5');
    expect(isIPBlocked).toHaveBeenCalledTimes(2);
  });
});
