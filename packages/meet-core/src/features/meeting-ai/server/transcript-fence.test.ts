import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), room: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('../../call/lib/call-access', () => ({
  getMeetCallAccess: mocks.access,
}));
vi.mock('../../call/server/room-service', () => ({
  callRoomService: mocks.room,
}));

import {
  recordMeetTranscriptSession,
  requireMeetTranscriptFence,
} from './transcript-fence';

const host = '00000000-0000-4000-8000-0000000000aa';
const guest = '00000000-0000-4000-8000-0000000000cc';
const sessionId = '00000000-0000-4000-8000-0000000000dd';
const room = { user: { id: host } };
const fence = (
  ready: boolean,
  sourcesAllowed?: boolean,
  sessionActive = true
) => ({
  fence: { ready, pending: ready ? 0 : 1, declined: 0, admitted: 2 },
  sourcesAllowed,
  sessionActive,
});
const require_ = () =>
  requireMeetTranscriptFence({
    meetingId: 'meeting',
    actorId: host,
    sessionId,
    sourceAccountIds: [host, guest, guest],
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(room);
});

it('admits only when everyone and every chunk source allows', async () => {
  mocks.room.mockResolvedValue(fence(true, true));
  await expect(require_()).resolves.toBeUndefined();
  expect(mocks.room).toHaveBeenCalledWith(room, {
    action: 'transcript.consent.read',
    accounts: [host, guest],
    sessionId,
  });
  for (const view of [fence(false, true), fence(true, false), fence(true)]) {
    mocks.room.mockResolvedValue(view);
    await expect(require_()).rejects.toMatchObject({
      status: 409,
      code: 'MEET_TRANSCRIPT_CONSENT_REQUIRED',
    });
  }
});

it('refuses when the host left the room or the account changed', async () => {
  mocks.room.mockRejectedValue(Object.assign(new Error('x'), { status: 403 }));
  await expect(require_()).rejects.toMatchObject({ status: 409 });
  mocks.access.mockResolvedValue({ user: { id: guest } });
  await expect(require_()).rejects.toMatchObject({ status: 409 });
});

it('refuses with a retryable 503 when the room is unavailable', async () => {
  mocks.room.mockRejectedValue(Object.assign(new Error('x'), { status: 502 }));
  await expect(require_()).rejects.toMatchObject({ status: 503 });
});

it('fails a start closed but ends best effort', async () => {
  mocks.room.mockRejectedValue(Object.assign(new Error('x'), { status: 503 }));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(
    recordMeetTranscriptSession({
      meetingId: 'meeting',
      actorId: host,
      sessionId,
      active: true,
    })
  ).rejects.toMatchObject({ status: 503 });
  await expect(
    recordMeetTranscriptSession({
      meetingId: 'meeting',
      actorId: host,
      sessionId,
      active: false,
    })
  ).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledOnce();
});

it('refuses a chunk whose session is not the room’s running recording', async () => {
  mocks.room.mockResolvedValue({});
  await expect(require_()).rejects.toMatchObject({ status: 409 });
  mocks.room.mockResolvedValue(fence(true, true, false));
  await expect(require_()).rejects.toMatchObject({
    status: 409,
    message: 'Transcription has ended',
  });
});
