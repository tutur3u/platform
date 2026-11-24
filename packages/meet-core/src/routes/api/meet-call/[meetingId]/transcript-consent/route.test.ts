import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  available: vi.fn(),
  room: vi.fn(),
  extras: vi.fn(),
  selfChoice: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock(
  '../../../../../features/meeting-ai/server/transcription-availability',
  () => ({ readMeetTranscriptionAvailability: f.available })
);
vi.mock('../../../../../features/meeting-ai/server/self-v1-controls', () => ({
  consentViewExtras: f.extras,
  selfModeConsentChoice: f.selfChoice,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
const guestAccess = {
  user: { id: 'guest' },
  guest: true,
  meeting: { id: 'room', ws_id: 'ws' },
};
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: f.room,
  guestPollRoomRoute: async (
    _request: Request,
    _id: string,
    run: (access: unknown) => Promise<unknown>
  ) => Response.json(await run(guestAccess)),
}));

import { MEET_TRANSCRIPT_NOTICE_VERSION as version } from '@tuturuuu/realtime/meet';
import { GET, POST } from './route';

const params = { params: Promise.resolve({ meetingId: 'room' }) };
const post = (body: unknown) =>
  POST(
    new Request('https://meet.test/transcript-consent', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    params
  );
const read = {
  version,
  choice: null,
  fence: { ready: false, pending: 1, declined: 0, admitted: 1 },
  active: false,
  activeSince: null,
};

const roomMode = {
  mode: 'room',
  perSpeakerAvailable: false,
  session: null,
  canManageMode: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  f.available.mockResolvedValue({ available: true });
  f.room.mockResolvedValue(read);
  f.extras.mockResolvedValue(roomMode);
  f.selfChoice.mockResolvedValue(null);
});

it('reports the unavailable reason without touching the room', async () => {
  f.available.mockResolvedValue({ available: false, reason: 'audience' });
  const response = await GET(new Request('https://meet.test/x'), params);
  expect(await response.json()).toEqual({
    available: false,
    reason: 'audience',
  });
  expect(f.available).toHaveBeenCalledWith('ws');
  expect(f.room).not.toHaveBeenCalled();
});

it('reads only the caller view, guests included', async () => {
  const response = await GET(new Request('https://meet.test/x'), params);
  expect(await response.json()).toEqual({
    available: true,
    ...read,
    ...roomMode,
  });
  expect(f.room).toHaveBeenCalledWith(guestAccess, {
    action: 'transcript.consent.read',
  });
});

it('adds the per-speaker session for the caller', async () => {
  const self = {
    mode: 'self',
    perSpeakerAvailable: true,
    session: { sessionId: 's', protocol: 'self_v1' },
    canManageMode: false,
  };
  f.extras.mockResolvedValue(self);
  const response = await GET(new Request('https://meet.test/x'), params);
  expect(await response.json()).toEqual({ available: true, ...read, ...self });
  expect(f.extras).toHaveBeenCalledWith(guestAccess, read);
});

it('gives the per-speaker choice result while the room is in self mode', async () => {
  f.selfChoice.mockResolvedValue(
    Response.json({ available: true, choice: 'allow', mode: 'self' })
  );
  const response = await post({ choice: 'allow', version });
  expect(await response.json()).toEqual({
    available: true,
    choice: 'allow',
    mode: 'self',
  });
  expect(f.selfChoice).toHaveBeenCalledWith(
    expect.any(Request),
    guestAccess,
    'allow'
  );
  expect(f.available).not.toHaveBeenCalled();
  expect(f.room).not.toHaveBeenCalled();
});

it('records only the caller choice for the current notice', async () => {
  await post({ choice: 'allow', version });
  expect(f.room).toHaveBeenCalledWith(expect.anything(), {
    action: 'transcript.consent.choice',
    choice: 'allow',
    version,
  });
  for (const body of [
    { choice: 'allow', version: 'old' },
    { choice: 'allow', version, accountId: 'someone-else' },
    { choice: 'continue', version },
  ])
    await expect(post(body)).rejects.toMatchObject({ status: 400 });
});

it('always lets a participant decline, but Allow needs the transcript available', async () => {
  f.available.mockResolvedValue({ available: false, reason: 'disabled' });
  await expect(post({ choice: 'allow', version })).rejects.toMatchObject({
    status: 403,
  });
  await post({ choice: 'decline', version });
  expect(f.room).toHaveBeenCalledWith(expect.anything(), {
    action: 'transcript.consent.choice',
    choice: 'decline',
    version,
  });
});
