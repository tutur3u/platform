import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reserve: vi.fn(), policy: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./security-budget', () => ({ reserveSecurityBudget: mocks.reserve }));

vi.mock('./security-budget-policy', async (original) => ({
  ...(await original<typeof import('./security-budget-policy')>()),
  getSecurityBudgetPolicy: mocks.policy,
}));

import { reserveStorageDownloadBudget } from './storage-download-budget';

const ticket = {
  wsId: 'ws-1',
  issuedAt: 1,
  expiresAt: 2,
  url: 'https://storage.example.test/storage/v1/object/sign/workspaces/ws-1/file.zip?token=secret',
};

describe('shared download reservations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    vi.stubEnv('STORAGE_DOWNLOADS_DISABLED', 'false');
    vi.stubEnv('STORAGE_DOWNLOAD_GLOBAL_DAILY_BYTES', '100');
    vi.stubEnv('STORAGE_DOWNLOAD_GLOBAL_MONTHLY_BYTES', '200');
    vi.stubEnv('STORAGE_DOWNLOAD_WORKSPACE_DAILY_BYTES', '80');
    mocks.policy.mockReset().mockResolvedValue({
      tier: 'PRO',
      multiplier: 10,
      paidWorkspaceCount: 1,
    });
    mocks.reserve.mockReset().mockResolvedValue([1, 0]);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('reserves every byte dimension in one atomic invocation without exposing credentials', async () => {
    await reserveStorageDownloadBudget(ticket, 45);
    expect(mocks.reserve).toHaveBeenCalledOnce();
    const dimensions = mocks.reserve.mock.calls[0]![0];
    expect(dimensions).toHaveLength(3);
    expect(dimensions.map(([key]: [string]) => key).join()).not.toContain(
      'secret'
    );
    expect(
      dimensions.map(([, ...values]: [string, ...number[]]) => values)
    ).toEqual([
      [45, 100, 172800],
      [45, 200, 32 * 86400],
      [45, 80, 172800],
    ]);
  });

  it('uses the same request counters for new tickets of the same file', async () => {
    await reserveStorageDownloadBudget(ticket);
    await reserveStorageDownloadBudget({
      ...ticket,
      url: ticket.url.replace('secret', 'fresh-token'),
    });
    expect(mocks.reserve.mock.calls[0]?.[0]).toEqual(
      mocks.reserve.mock.calls[1]?.[0]
    );
  });

  it('returns 429 with retry timing when any shared budget rejects a download', async () => {
    mocks.reserve.mockResolvedValue([0, 2]);
    await expect(
      reserveStorageDownloadBudget(ticket, 45)
    ).rejects.toMatchObject({ status: 429, retryAfter: 1_440_000 });
  });

  it('fails closed on database errors or malformed responses', async () => {
    mocks.reserve.mockRejectedValue(new Error('unavailable'));
    await expect(reserveStorageDownloadBudget(ticket)).rejects.toMatchObject({
      status: 503,
    });
    mocks.reserve.mockRejectedValue(new Error('offline'));
    await expect(reserveStorageDownloadBudget(ticket)).rejects.toMatchObject({
      status: 503,
    });
    mocks.reserve.mockResolvedValue([1]);
    await expect(reserveStorageDownloadBudget(ticket)).rejects.toMatchObject({
      status: 503,
    });
  });

  it('rejects disabled downloads, unsafe sizes, and invalid budget configuration', async () => {
    vi.stubEnv('STORAGE_DOWNLOADS_DISABLED', 'true');
    await expect(reserveStorageDownloadBudget(ticket)).rejects.toMatchObject({
      status: 503,
    });
    vi.stubEnv('STORAGE_DOWNLOADS_DISABLED', 'false');
    await expect(
      reserveStorageDownloadBudget(ticket, NaN)
    ).rejects.toMatchObject({ status: 502 });
    vi.stubEnv('STORAGE_DOWNLOAD_GLOBAL_DAILY_BYTES', '0');
    await expect(
      reserveStorageDownloadBudget(ticket, 45)
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});

describe('plan-aware reservations', () => {
  beforeEach(() => {
    vi.stubEnv('STORAGE_DOWNLOADS_DISABLED', 'false');
    mocks.reserve.mockReset().mockResolvedValue([1, 0]);
  });
  afterEach(() => vi.unstubAllEnvs());
  it('gives free workspaces strict shared pools while paid memberships expand workspace/file limits', async () => {
    mocks.policy.mockResolvedValue({
      tier: 'FREE',
      multiplier: 1,
      paidWorkspaceCount: 0,
    });
    await reserveStorageDownloadBudget(ticket, 45);
    expect(mocks.reserve.mock.calls.at(-1)?.[0]).toHaveLength(5);
    await reserveStorageDownloadBudget(ticket);
    expect(mocks.reserve.mock.calls.at(-1)?.[0]).toHaveLength(3);
    expect(mocks.reserve.mock.calls.at(-1)?.[0][1][2]).toBe(10);
    mocks.policy.mockResolvedValue({
      tier: 'PRO',
      multiplier: 12.5,
      paidWorkspaceCount: 2,
    });
    await reserveStorageDownloadBudget(ticket);
    expect(mocks.reserve.mock.calls.at(-1)?.[0]).toHaveLength(2);
    expect(mocks.reserve.mock.calls.at(-1)?.[0][1][2]).toBe(125);
  });
});
