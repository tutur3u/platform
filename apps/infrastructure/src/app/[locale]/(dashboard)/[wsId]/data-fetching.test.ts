import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  serverLoggerError: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: unknown[]) => mocks.serverLoggerError(...args),
  },
}));

describe('infrastructure dashboard data fetching', () => {
  it('falls back to empty engagement metrics when the admin client is unavailable', async () => {
    mocks.createAdminClient.mockRejectedValue(new Error('missing env'));

    const { getEngagementMetrics } = await import('./data-fetching');

    await expect(getEngagementMetrics()).resolves.toEqual({
      dau: 0,
      mau: 0,
      wau: 0,
    });
    expect(mocks.serverLoggerError).toHaveBeenCalledWith(
      'Failed to create infrastructure dashboard admin client',
      expect.any(Error)
    );
    expect(mocks.serverLoggerError).toHaveBeenCalledWith(
      'Error fetching engagement metrics:',
      expect.any(Error)
    );
  });
});
