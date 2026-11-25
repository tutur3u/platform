import { MIRA_SHARE_MAX_CONTEXT_BYTES } from '@tuturuuu/realtime/meet';
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  room: vi.fn(),
  confirm: vi.fn(),
  enabled: true,
}));
vi.mock('server-only', () => ({}));
vi.mock('../../call/server/room-service', () => ({ callRoomService: f.room }));
vi.mock('./account-confirmation', () => ({
  requireMiraAccountConfirmation: f.confirm,
  usesMiraAccountConfirmation: () => f.enabled,
}));

import { forwardSharedTutorChat, readPrivateMiraShare } from './private-share';

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
