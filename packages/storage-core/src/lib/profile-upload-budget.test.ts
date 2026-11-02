import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ reserve: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./security-budget', () => ({ reserveSecurityBudget: f.reserve }));

import {
  ProfileUploadError as BudgetProfileUploadError,
  PROFILE_MEDIA_MAX_BYTES as budgetLimits,
  reserveProfileUploadBudget,
  reserveWorkspaceManagedAvatarBudget,
} from './profile-upload-budget';
import { ProfileUploadError } from './profile-upload-error';
import {
  PROFILE_MEDIA_MAX_BYTES,
  WORKSPACE_MANAGED_AVATAR_LIMITS,
} from './profile-upload-limits';

const now = new Date('2026-10-03T12:30:00Z');
beforeEach(() => {
  vi.clearAllMocks();
  f.reserve.mockResolvedValue([1, 0]);
});
it('preserves the pure limits export for existing budget callers', () => {
  expect(budgetLimits).toBe(PROFILE_MEDIA_MAX_BYTES);
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

it('consumes one shared ticket once and fails closed for replay or outage', async () => {
  const { consumeProfileUploadTicket } = await import(
    './profile-upload-budget'
  );
  await consumeProfileUploadTicket('synthetic-uuid');
  expect(f.reserve).toHaveBeenCalledWith([
    ['api-cost:v1:profile-upload:ticket:synthetic-uuid', 1, 1, 1200],
  ]);
  f.reserve.mockResolvedValue([0, 1]);
  await expect(
    consumeProfileUploadTicket('synthetic-uuid')
  ).rejects.toMatchObject({ status: 409 });
  f.reserve.mockRejectedValue(new Error('Missing RPC'));
  await expect(
    consumeProfileUploadTicket('synthetic-uuid')
  ).rejects.toMatchObject({ status: 503 });
});

it('preserves the shared error identity when the budget denies or fails closed', async () => {
  expect(BudgetProfileUploadError).toBe(ProfileUploadError);
  f.reserve.mockResolvedValue([0, 1]);
  await expect(
    reserveProfileUploadBudget('actor', 'avatar', now)
  ).rejects.toBeInstanceOf(ProfileUploadError);
  f.reserve.mockRejectedValue(new Error('Budget unavailable'));
  await expect(
    reserveProfileUploadBudget('actor', 'avatar', now)
  ).rejects.toBeInstanceOf(ProfileUploadError);
});

const MIB = 1024 ** 2;
const actorKey = (actor: string) =>
  createHash('sha256').update(actor).digest('hex');
const keysOf = (call: number) =>
  f.reserve.mock.calls[call]![0].map((d: unknown[]) => d[0] as string);

it('keeps the self-profile limits unchanged', async () => {
  await reserveProfileUploadBudget('actor', 'avatar', now);
  await reserveProfileUploadBudget('actor', 'banner', now);
  const limits = (call: number) =>
    f.reserve.mock.calls[call]![0].map((d: unknown[]) => d.slice(1));
  expect(limits(0)).toEqual([
    [1, 2, 7200],
    [1, 3, 172800],
    [1, 10, 8 * 86400],
    [2 * MIB, 16 * MIB, 172800],
    [2 * MIB, 32 * MIB, 8 * 86400],
    [1, 10000, 172800],
    [2 * MIB, 16 * 1024 ** 3, 172800],
  ]);
  expect(limits(1)[1]).toEqual([1, 2, 172800]);
  expect(keysOf(0).every((k: string) => !k.includes('ws-user-avatar'))).toBe(
    true
  );
});

it('gives workspace-managed avatars a much higher budget in constants', () => {
  expect(WORKSPACE_MANAGED_AVATAR_LIMITS).toMatchObject({
    perHour: 60,
    perDay: 300,
  });
  expect(WORKSPACE_MANAGED_AVATAR_LIMITS.perHour).toBeGreaterThan(2);
  expect(WORKSPACE_MANAGED_AVATAR_LIMITS.perDay).toBeGreaterThan(3);
  expect(WORKSPACE_MANAGED_AVATAR_LIMITS.perWeek).toBeGreaterThan(10);
  expect(WORKSPACE_MANAGED_AVATAR_LIMITS.bytesPerDay).toBeGreaterThan(16 * MIB);
});

it('sets the managed global ceilings to half the shared profile ceilings and caps an actor across workspaces', () => {
  expect(WORKSPACE_MANAGED_AVATAR_LIMITS).toMatchObject({
    globalPerDay: 5000,
    globalBytesPerDay: 8 * 1024 ** 3,
    actorPerDay: 600,
    actorBytesPerDay: 1200 * MIB,
  });
  // The actor cap sits above one workspace's budget but below the global.
  expect(WORKSPACE_MANAGED_AVATAR_LIMITS.actorPerDay).toBeGreaterThan(
    WORKSPACE_MANAGED_AVATAR_LIMITS.perDay
  );
  expect(WORKSPACE_MANAGED_AVATAR_LIMITS.actorPerDay).toBeLessThan(
    WORKSPACE_MANAGED_AVATAR_LIMITS.globalPerDay
  );
});

it('reserves workspace-managed avatars atomically against the managed limits', async () => {
  await reserveWorkspaceManagedAvatarBudget('ws-1', 'synthetic-actor', now);
  expect(f.reserve).toHaveBeenCalledTimes(1);
  const dimensions = f.reserve.mock.calls[0]![0];
  // The RPC accepts at most 8 dimensions per call.
  expect(dimensions).toHaveLength(8);
  expect(dimensions.map((d: unknown[]) => d.slice(1))).toEqual([
    [1, 60, 7200],
    [1, 300, 172800],
    [1, 1000, 8 * 86400],
    [PROFILE_MEDIA_MAX_BYTES.avatar, 600 * MIB, 172800],
    [1, 600, 172800],
    [PROFILE_MEDIA_MAX_BYTES.avatar, 1200 * MIB, 172800],
    [1, 5000, 172800],
    [PROFILE_MEDIA_MAX_BYTES.avatar, 8 * 1024 ** 3, 172800],
  ]);
  for (const key of keysOf(0)) {
    expect(key).toMatch(/^api-cost:v1:profile-upload:ws-user-avatar:/);
    expect(key.length).toBeLessThanOrEqual(256);
    expect(key).not.toContain('synthetic-actor');
    expect(key).not.toContain('ws-1');
  }
});

it('keeps the managed pool separate from self-profile counters and partitions by workspace and actor', async () => {
  await reserveProfileUploadBudget('actor', 'avatar', now);
  await reserveWorkspaceManagedAvatarBudget('ws-1', 'actor', now);
  await reserveWorkspaceManagedAvatarBudget('ws-2', 'actor', now);
  await reserveWorkspaceManagedAvatarBudget('ws-1', 'other-actor', now);
  const self = new Set(keysOf(0));
  for (const key of keysOf(1)) expect(self.has(key)).toBe(false);
  // Keys 0-3 are per workspace AND actor, so none collide.
  const perWorkspace = [1, 2, 3].map((call) => keysOf(call).slice(0, 4));
  expect(new Set(perWorkspace.flat()).size).toBe(12);
  // Keys 4-5 are per actor across workspaces; keys 6-7 are the managed globals.
  expect(keysOf(1).slice(4, 6)).toEqual(keysOf(2).slice(4, 6));
  expect(keysOf(1).slice(4, 6)).not.toEqual(keysOf(3).slice(4, 6));
  expect(keysOf(1).slice(6)).toEqual(keysOf(3).slice(6));
  for (const key of keysOf(1).slice(4, 6)) expect(key).not.toContain('ws:');
});

it('caps one actor across workspaces below the sum of the per-workspace budgets', async () => {
  // Atomic, all-or-nothing counter store with the RPC's check-then-increment semantics.
  const used = new Map<string, number>();
  f.reserve.mockImplementation(async (dims: [string, number, number][]) => {
    for (const [i, [key, amount, maximum]] of dims.entries())
      if ((used.get(key) ?? 0) + amount > maximum) return [0, i + 1];
    for (const [key, amount] of dims)
      used.set(key, (used.get(key) ?? 0) + amount);
    return [1, 0];
  });
  const limits = WORKSPACE_MANAGED_AVATAR_LIMITS;
  const day = new Date('2026-10-03T00:00:00Z');
  // 60/hour per workspace: spread the calls over hours so only day caps bind.
  const at = (n: number) =>
    new Date(day.getTime() + Math.floor(n / 60) * 3600000);
  let issued = 0;
  for (const ws of ['ws-1', 'ws-2', 'ws-3'])
    for (let i = 0; i < limits.perDay; i++)
      await reserveWorkspaceManagedAvatarBudget(
        ws,
        'admin',
        at(issued++)
      ).catch(() => {
        issued--;
      });
  // 3 x 300 would pass per-workspace limits; the actor cap stops at 600.
  expect(
    used.get(
      `api-cost:v1:profile-upload:ws-user-avatar:actor:${actorKey('admin')}:day:${Math.floor(day.getTime() / 86400000)}`
    )
  ).toBe(limits.actorPerDay);
  // A different actor in a workspace the first actor exhausted is unaffected.
  await expect(
    reserveWorkspaceManagedAvatarBudget('ws-3', 'colleague', at(0))
  ).resolves.toBeUndefined();
  // The first actor is denied everywhere and gets the end-of-day reset.
  await expect(
    reserveWorkspaceManagedAvatarBudget('ws-4', 'admin', at(599))
  ).rejects.toMatchObject({ status: 429 });
  expect(issued).toBe(limits.actorPerDay);
});

it('rolls managed windows at the UTC hour, day and Monday-week boundaries', async () => {
  // 2026-10-03 is a Saturday; the week ends Monday 2026-10-05T00:00Z.
  const times = [
    new Date('2026-10-03T12:59:59Z'),
    new Date('2026-10-03T13:00:00Z'),
    new Date('2026-10-04T00:00:00Z'),
    new Date('2026-10-05T00:00:00Z'),
  ];
  for (const t of times)
    await reserveWorkspaceManagedAvatarBudget('ws-1', 'actor', t);
  const k = (call: number) => keysOf(call);
  // Keys: [0] hour, [1] day, [2] week, [3] bytes day, [4] actor day, [6] global day.
  expect(k(0)[0]).not.toBe(k(1)[0]);
  expect(k(0)[1]).toBe(k(1)[1]);
  expect(k(0)[2]).toBe(k(1)[2]);
  expect(k(1)[1]).not.toBe(k(2)[1]);
  expect(k(1)[3]).not.toBe(k(2)[3]);
  expect(k(1)[4]).not.toBe(k(2)[4]);
  expect(k(1)[6]).not.toBe(k(2)[6]);
  expect(k(1)[2]).toBe(k(2)[2]);
  expect(k(2)[2]).not.toBe(k(3)[2]);
});

it.each([
  ['hour', 0, 1800],
  ['day', 1, 41400],
  ['week', 2, 127800],
  ['bytes day', 3, 41400],
  ['actor day (all workspaces)', 4, 41400],
  ['actor bytes day (all workspaces)', 5, 41400],
  ['global day', 6, 41400],
  ['global bytes day', 7, 41400],
])(
  'reports the managed %s window reset on denial',
  async (_window, index, retryAfter) => {
    f.reserve.mockResolvedValue([0, index + 1]);
    await expect(
      reserveWorkspaceManagedAvatarBudget('ws-1', 'actor', now)
    ).rejects.toMatchObject({ status: 429, retryAfter });
  }
);

it('fails managed reservations closed when protection is unavailable or malformed', async () => {
  f.reserve.mockRejectedValue(new Error('Missing RPC'));
  await expect(
    reserveWorkspaceManagedAvatarBudget('ws-1', 'actor', now)
  ).rejects.toMatchObject({ status: 503 });
  f.reserve.mockResolvedValue([0, 99]);
  await expect(
    reserveWorkspaceManagedAvatarBudget('ws-1', 'actor', now)
  ).rejects.toMatchObject({ status: 503 });
});
