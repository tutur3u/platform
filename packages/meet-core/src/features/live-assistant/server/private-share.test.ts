import { MIRA_SHARE_MAX_CONTEXT_BYTES } from '@tuturuuu/realtime/meet';
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  room: vi.fn(),
  confirm: vi.fn(),
  confirmedAt: vi.fn(),
  stop: vi.fn(),
  enabled: true,
}));
vi.mock('server-only', () => ({}));
vi.mock('../../call/server/room-service', () => ({ callRoomService: f.room }));
vi.mock('./account-confirmation', () => ({
  isMiraAccountMissing: (error: unknown) =>
    (error as { missing?: boolean } | null)?.missing === true,
  readMiraConfirmedAt: f.confirmedAt,
  requireMiraAccountConfirmation: f.confirm,
  usesMiraAccountConfirmation: () => f.enabled,
}));
vi.mock('./private-consent', () => ({
  stopPrivateMiraSessions: f.stop,
}));

import {
  forwardSharedTutorChat,
  readPrivateMiraShare,
  revokePrivateMiraShare,
  setPrivateMiraShare,
} from './private-share';

const access = { user: { id: '00000000-0000-4000-8000-000000000001' } };
type Access = Parameters<typeof forwardSharedTutorChat>[0];
const turns = Array.from({ length: 15 }, (_, index) => ({
  body: index === 14 ? '   ' : `turn ${index} ${'x'.repeat(2100)}`,
  assistant: index % 2 === 1,
}));

// Confirmed before the share was turned on.
const confirmedAt = 1_800_000_000_000;
const sharedAt = confirmedAt + 60_000;

beforeEach(() => {
  vi.resetAllMocks();
  f.enabled = true;
  f.confirmedAt.mockResolvedValue(confirmedAt);
});

it('sends nothing while the redesign flag is off', async () => {
  f.enabled = false;
  await forwardSharedTutorChat(access as Access, turns, sharedAt);
  expect(f.room).not.toHaveBeenCalled();
  expect(await readPrivateMiraShare(access as Access)).toBeUndefined();
});

it('sends nothing for an unconfirmed or under-18 account', async () => {
  f.confirm.mockRejectedValue(new Error('Confirm your account'));
  await forwardSharedTutorChat(access as Access, turns, sharedAt);
  expect(f.room).not.toHaveBeenCalled();
});

it('hands only the latest bounded tutor turns to the room and ignores a refusal', async () => {
  f.room.mockRejectedValue(new Error('Private Mira sharing is unavailable'));
  const short = turns.map((turn, index) => ({
    ...turn,
    body: index === 14 ? ' ' : `turn ${index}`,
  }));
  await expect(
    forwardSharedTutorChat(access as Access, short, sharedAt)
  ).resolves.toBeUndefined();
  const [, command] = f.room.mock.calls[0]!;
  expect(command.action).toBe('mira.share.context');
  expect(command.tutor).toHaveLength(12);
  expect(command.tutor[0].body).toBe('turn 2');

  await forwardSharedTutorChat(access as Access, turns, sharedAt);
  const [, large] = f.room.mock.calls[1]!;
  const bodies = large.tutor.map(({ body }: { body: string }) => body);
  expect(bodies.at(-1)).toMatch(/^turn 13 /);
  expect(bodies.every((body: string) => body.length <= 2000)).toBe(true);
  expect(
    new TextEncoder().encode(JSON.stringify(large.tutor)).byteLength
  ).toBeLessThanOrEqual(MIRA_SHARE_MAX_CONTEXT_BYTES - 1000);
});

it('reports sharing as off when the room cannot confirm it', async () => {
  f.room.mockRejectedValue(new Error('offline'));
  expect(await readPrivateMiraShare(access as Access)).toEqual({
    enabled: false,
    revision: 0,
  });
});

const revoke = {
  action: 'share' as const,
  enabled: false,
  expectedActorId: access.user.id,
};
const live = {} as Parameters<typeof setPrivateMiraShare>[2];

const session = '00000000-0000-4000-8000-000000000004';

it('ends the sessions the room returns on revoke, admitted or not', async () => {
  const sessions = [session];
  // The room returns the owner's registered sessions with the revoke, so a
  // person who already left the call has their sessions stopped too.
  f.room.mockResolvedValue({ enabled: false, revision: 2, sessions });
  expect(await setPrivateMiraShare(access as Access, revoke, live)).toEqual({
    enabled: false,
    revision: 2,
  });
  expect(f.room).toHaveBeenCalledWith(access, {
    action: 'mira.share.set',
    enabled: false,
  });
  expect(f.stop).toHaveBeenCalledWith(access, sessions, live);
  expect(f.confirm).not.toHaveBeenCalled();
});

it('stops nothing when there was never a share, and reports a failed stop', async () => {
  f.room.mockResolvedValue({ enabled: false, revision: 0 });
  await setPrivateMiraShare(access as Access, revoke, live);
  expect(f.stop).not.toHaveBeenCalled();

  f.room.mockResolvedValue({
    enabled: false,
    revision: 3,
    sessions: [session],
  });
  f.stop.mockRejectedValue(new Error('Private Mira could not stop'));
  await expect(
    setPrivateMiraShare(access as Access, revoke, live)
  ).rejects.toThrow('Private Mira could not stop');
  expect(f.room).toHaveBeenLastCalledWith(access, {
    action: 'mira.share.set',
    enabled: false,
  });
});

it('stops the sessions even without a share when asked to, as on withdrawal', async () => {
  f.room.mockResolvedValue({
    enabled: false,
    revision: 0,
    sessions: [session],
  });
  await revokePrivateMiraShare(access as Access, live, { always: true });
  expect(f.stop).toHaveBeenCalledWith(access, [session], live);
});

it('revokes a share turned on before the latest confirmation instead of using it', async () => {
  // Withdrawn, then confirmed again after the share was turned on.
  f.confirmedAt.mockResolvedValue(sharedAt + 1);
  await forwardSharedTutorChat(access as Access, turns, sharedAt);
  expect(f.room).toHaveBeenCalledExactlyOnceWith(access, {
    action: 'mira.share.set',
    enabled: false,
  });

  f.room.mockReset();
  f.room.mockResolvedValue({ enabled: true, revision: 4, sharedAt });
  expect(await readPrivateMiraShare(access as Access)).toEqual({
    enabled: false,
    revision: 4,
  });
  expect(f.room).toHaveBeenLastCalledWith(access, {
    action: 'mira.share.set',
    enabled: false,
  });
});

it('keeps a share turned on after the latest confirmation, and fails closed', async () => {
  f.room.mockResolvedValue({ enabled: true, revision: 4, sharedAt });
  expect(await readPrivateMiraShare(access as Access)).toEqual({
    enabled: true,
    revision: 4,
  });
  expect(f.room).toHaveBeenCalledOnce();
  // An unknown start counts as off, without revoking anything.
  f.room.mockClear();
  f.room.mockResolvedValue({ enabled: true, revision: 4 });
  expect(await readPrivateMiraShare(access as Access)).toMatchObject({
    enabled: false,
  });
  expect(f.room).toHaveBeenCalledOnce();
  // No confirmation at all is stale: the share is revoked.
  f.confirmedAt.mockResolvedValue(null);
  f.room.mockResolvedValue({ enabled: true, revision: 4, sharedAt });
  expect(await readPrivateMiraShare(access as Access)).toMatchObject({
    enabled: false,
  });
});

const revokeCall = [access, { action: 'mira.share.set', enabled: false }];

it('treats a failed confirmation lookup as off for now, without revoking', async () => {
  f.confirmedAt.mockRejectedValue(new Error('Admin API unavailable'));
  f.room.mockResolvedValue({ enabled: true, revision: 4, sharedAt });
  expect(await readPrivateMiraShare(access as Access)).toEqual({
    enabled: false,
    revision: 4,
  });
  await forwardSharedTutorChat(access as Access, turns, sharedAt);
  // One share read; no revoke and no forwarded chat.
  expect(f.room).toHaveBeenCalledOnce();
  expect(f.room).not.toHaveBeenCalledWith(...revokeCall);

  // A missing confirmation is a withdrawal, so that share is revoked.
  f.confirmedAt.mockResolvedValue(null);
  await forwardSharedTutorChat(access as Access, turns, sharedAt);
  expect(f.room).toHaveBeenLastCalledWith(...revokeCall);
});

const enable = { ...revoke, enabled: true };

it('refuses a deleted owner instead of reading the share as unknown', async () => {
  const missing = Object.assign(new Error('Mira confirmation is unavailable'), {
    missing: true,
  });
  f.confirmedAt.mockRejectedValue(missing);
  f.room.mockResolvedValue({ enabled: true, revision: 3, sharedAt });
  await expect(readPrivateMiraShare(access as Access)).rejects.toBe(missing);
  // A refusal, not a revocation on the strength of a lookup.
  expect(f.room).toHaveBeenCalledTimes(1);
});

it('replaces a grant older than the latest confirmation on a fresh opt-in', async () => {
  f.confirmedAt.mockResolvedValue(sharedAt + 1);
  f.room
    .mockResolvedValueOnce({ enabled: true, revision: 4, sharedAt })
    .mockResolvedValueOnce({ enabled: false, revision: 5 })
    .mockResolvedValueOnce({
      enabled: true,
      revision: 6,
      sharedAt: sharedAt + 5000,
    });
  expect(await setPrivateMiraShare(access as Access, enable, live)).toEqual({
    enabled: true,
    revision: 6,
  });
  expect(f.room.mock.calls.map(([, command]) => command)).toEqual([
    { action: 'mira.share.set', enabled: true },
    { action: 'mira.share.set', enabled: false },
    { action: 'mira.share.set', enabled: true },
  ]);
});

it('refuses an opt-in it cannot check against the confirmation', async () => {
  f.confirmedAt.mockRejectedValue(new Error('Admin API unavailable'));
  f.room.mockResolvedValue({ enabled: true, revision: 4, sharedAt });
  await expect(
    setPrivateMiraShare(access as Access, enable, live)
  ).rejects.toMatchObject({ status: 503 });
  expect(f.room).not.toHaveBeenCalledWith(...revokeCall);
});
