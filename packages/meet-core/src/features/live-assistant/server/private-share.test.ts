import { MIRA_SHARE_MAX_CONTEXT_BYTES } from '@tuturuuu/realtime/meet';
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  room: vi.fn(),
  confirm: vi.fn(),
  stop: vi.fn(),
  enabled: true,
}));
vi.mock('server-only', () => ({}));
vi.mock('../../call/server/room-service', () => ({ callRoomService: f.room }));
vi.mock('./account-confirmation', () => ({
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

beforeEach(() => {
  vi.resetAllMocks();
  f.enabled = true;
});

it('sends nothing while the redesign flag is off', async () => {
  f.enabled = false;
  await forwardSharedTutorChat(access as Access, turns);
  expect(f.room).not.toHaveBeenCalled();
  expect(await readPrivateMiraShare(access as Access)).toBeUndefined();
});

it('sends nothing for an unconfirmed or under-18 account', async () => {
  f.confirm.mockRejectedValue(new Error('Confirm your account'));
  await forwardSharedTutorChat(access as Access, turns);
  expect(f.room).not.toHaveBeenCalled();
});

it('hands only the latest bounded tutor turns to the room and ignores a refusal', async () => {
  f.room.mockRejectedValue(new Error('Private Mira sharing is unavailable'));
  const short = turns.map((turn, index) => ({
    ...turn,
    body: index === 14 ? ' ' : `turn ${index}`,
  }));
  await expect(
    forwardSharedTutorChat(access as Access, short)
  ).resolves.toBeUndefined();
  const [, command] = f.room.mock.calls[0]!;
  expect(command.action).toBe('mira.share.context');
  expect(command.tutor).toHaveLength(12);
  expect(command.tutor[0].body).toBe('turn 2');

  await forwardSharedTutorChat(access as Access, turns);
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

