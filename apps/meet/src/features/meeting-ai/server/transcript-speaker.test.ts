import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mock = vi.hoisted(() => ({ room: vi.fn(), verify: vi.fn() }));
vi.mock('@/features/call/lib/call-access', () => ({
  getMeetCallAccess: mock.room,
}));
vi.mock('@/features/call/server/room-service', () => ({
  callRoomService: mock.verify,
}));
vi.mock('./access', () => ({
  MeetAiError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import { resolveTranscriptSpeaker } from './transcript-speaker';

const actorId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
function database(display_name: string | null, email: string | null) {
  const from = vi.fn((table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: table === 'users' ? { display_name } : { email },
          error: null,
        }),
      }),
    }),
  }));
  return { from };
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.room.mockResolvedValue({ user: { id: actorId } });
  mock.verify.mockResolvedValue({ accountId });
});
it.each([
  ['Alice', 'alice@example.com', 'Alice'],
  ['  ', 'alice@example.com', 'alice@example.com'],
])('uses saved display name then email: %s', async (name, email, expected) => {
  const db = database(name!, email!);
  expect(
    await resolveTranscriptSpeaker({
      db: db as never,
      meetingId: actorId,
      actorId,
      accountId,
      kind: 'shared_audio',
    })
  ).toEqual({ accountId, displayName: expected, kind: 'shared_audio' });
  expect(mock.verify).toHaveBeenCalledWith(expect.anything(), {
    action: 'transcription.speaker',
    accountId,
  });
});
it('does not look up profiles when admission or actor verification fails', async () => {
  const db = database('Alice', null);
  mock.verify.mockResolvedValueOnce({ accountId: actorId });
  await expect(
    resolveTranscriptSpeaker({
      db: db as never,
      meetingId: actorId,
      actorId,
      accountId,
    })
  ).rejects.toMatchObject({ status: 403 });
  expect(db.from).not.toHaveBeenCalled();
  mock.room.mockResolvedValueOnce({ user: { id: accountId } });
  await expect(
    resolveTranscriptSpeaker({
      db: db as never,
      meetingId: actorId,
      actorId,
      accountId,
    })
  ).rejects.toMatchObject({ status: 409 });
});
it('keeps historical sources unattributed', async () => {
  const db = database(null, null);
  expect(
    await resolveTranscriptSpeaker({
      db: db as never,
      meetingId: actorId,
      actorId,
    })
  ).toBeNull();
  expect(db.from).not.toHaveBeenCalled();
});
