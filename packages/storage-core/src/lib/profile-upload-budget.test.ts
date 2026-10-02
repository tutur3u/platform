import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ reserve: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./security-budget', () => ({ reserveSecurityBudget: f.reserve }));

import { reserveProfileUploadBudget } from './profile-upload-budget';

const now = new Date('2026-10-03T12:30:00Z');
beforeEach(() => {
  vi.clearAllMocks();
  f.reserve.mockResolvedValue([1, 0]);
});
it('reserves all account and global limits in one atomic call, without raw actor identifiers', async () => {
  await reserveProfileUploadBudget('synthetic-actor', 'avatar', now);
  const dimensions = f.reserve.mock.calls[0]![0];
  expect(dimensions).toHaveLength(7);
  expect(dimensions.map((d: unknown[]) => d[0]).join()).not.toContain(
    'synthetic-actor'
  );
  expect(dimensions[0].slice(1, 3)).toEqual([1, 2]);
  expect(dimensions[1].slice(1, 3)).toEqual([1, 3]);
  expect(dimensions[3].slice(1, 3)).toEqual([2 * 1024 ** 2, 16 * 1024 ** 2]);
});
it('shares account limits across media kinds and charges the full banner ceiling', async () => {
  await reserveProfileUploadBudget('actor', 'avatar', now);
  await reserveProfileUploadBudget('actor', 'banner', now);
  const avatar = f.reserve.mock.calls[0]![0],
    banner = f.reserve.mock.calls[1]![0];
  expect(avatar[0][0]).toBe(banner[0][0]);
  expect(avatar[2][0]).toBe(banner[2][0]);
  expect(banner[1].slice(1, 3)).toEqual([1, 2]);
  expect(banner[3][1]).toBe(5 * 1024 ** 2);
});
it('returns the denied calendar reset without issuing a fresh counter key', async () => {
  f.reserve.mockResolvedValue([0, 1]);
  await expect(
    reserveProfileUploadBudget('actor', 'avatar', now)
  ).rejects.toMatchObject({ status: 429, retryAfter: 1800 });
});
it('fails closed when the shared migration or budget service is unavailable', async () => {
  f.reserve.mockRejectedValue(new Error('Missing RPC'));
  await expect(
    reserveProfileUploadBudget('actor', 'avatar', now)
  ).rejects.toMatchObject({ status: 503 });
});
it('rejects invalid denied dimensions', async () => {
  f.reserve.mockResolvedValue([0, 99]);
  await expect(
    reserveProfileUploadBudget('actor', 'avatar', now)
  ).rejects.toMatchObject({ status: 503 });
});
