import { MIRA_PRIVATE_NOTICE_VERSION } from '@tuturuuu/realtime/meet';
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ room: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('../../call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));
vi.mock('../../call/server/room-service', () => ({ callRoomService: f.room }));
vi.mock('./account-confirmation', () => ({
  requireMiraAccountConfirmation: vi.fn(),
  usesMiraAccountConfirmation: () => false,
}));

import { MeetCallAccessError } from '../../call/lib/call-access';
import { recordPrivateMiraChoice } from './private-consent';

const access = {
  user: { id: 'owner' },
  meeting: { id: 'meeting', ws_id: 'workspace' },
} as unknown as Parameters<typeof recordPrivateMiraChoice>[0];
const initialize = {
  action: 'mira.private.initialize',
  version: MIRA_PRIVATE_NOTICE_VERSION,
} as const;
const snapshot = (choice: 'continue' | 'mute' | null) => ({
  version: MIRA_PRIVATE_NOTICE_VERSION,
  admitted: true,
  choice: choice && {
    choice,
    version: MIRA_PRIVATE_NOTICE_VERSION,
    meetingId: 'meeting',
    accountId: 'owner',
    recordedAt: 1,
    revision: 2,
  },
  sessions: [],
});

beforeEach(() => vi.resetAllMocks());

it('returns the recorded Continue when the room answer was lost', async () => {
  f.room
    .mockRejectedValueOnce(new MeetCallAccessError(503, 'Unavailable'))
    .mockResolvedValueOnce(snapshot('continue'));
  await expect(recordPrivateMiraChoice(access, initialize)).resolves.toEqual(
    snapshot('continue')
  );
  expect(f.room).toHaveBeenLastCalledWith(access, {
    action: 'mira.private.read',
  });
});

it('keeps the failure when the room did not record the choice', async () => {
  const lost = new TypeError('fetch failed');
  f.room.mockRejectedValueOnce(lost).mockResolvedValueOnce(snapshot('mute'));
  await expect(recordPrivateMiraChoice(access, initialize)).rejects.toBe(lost);
  // A read that also fails keeps the original failure too.
  f.room
    .mockRejectedValueOnce(lost)
    .mockRejectedValueOnce(new MeetCallAccessError(503, 'Unavailable'));
  await expect(recordPrivateMiraChoice(access, initialize)).rejects.toBe(lost);
});

it('passes a room refusal through without reading back', async () => {
  const refusal = new MeetCallAccessError(409, 'Private Mira is off');
  f.room.mockRejectedValueOnce(refusal);
  await expect(
    recordPrivateMiraChoice(access, {
      action: 'mira.private.choice',
      choice: 'continue',
      version: MIRA_PRIVATE_NOTICE_VERSION,
    })
  ).rejects.toBe(refusal);
  expect(f.room).toHaveBeenCalledTimes(1);
});
