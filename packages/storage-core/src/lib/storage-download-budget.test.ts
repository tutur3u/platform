import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reserve: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./security-budget', () => ({ reserveSecurityBudget: mocks.reserve }));

import { reserveStorageDownloadBudget } from './storage-download-budget';

const ticket = {
  wsId: 'ws-1',
  issuedAt: 1,
  expiresAt: 2,
  url: 'https://storage.example.test/storage/v1/object/sign/workspaces/ws-1/file.zip?token=secret',
};

describe('shared download reservations', () => {
  beforeEach(() => {
    vi.stubEnv('STORAGE_DOWNLOADS_DISABLED', 'false');
    vi.stubEnv('STORAGE_DOWNLOAD_GLOBAL_DAILY_BYTES', '100');
    vi.stubEnv('STORAGE_DOWNLOAD_GLOBAL_MONTHLY_BYTES', '200');
    vi.stubEnv('STORAGE_DOWNLOAD_WORKSPACE_DAILY_BYTES', '80');
    mocks.reserve.mockReset().mockResolvedValue([1, 0]);
  });
  afterEach(() => vi.unstubAllEnvs());

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
    ).rejects.toMatchObject({ status: 429, retryAfter: expect.any(Number) });
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
