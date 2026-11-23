import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  available: vi.fn(),
  room: vi.fn(),
  accept: vi.fn(),
  end: vi.fn(),
  record: vi.fn(),
  boxDefault: vi.fn(),
  openRevision: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock(
  '../../../../../features/live-assistant/server/room-mira-authority',
  () => ({ readRoomMiraAvailability: f.available })
);
vi.mock(
  '../../../../../features/live-assistant/server/room-mira-acceptance',
  () => ({ acceptRoomMira: f.accept, endRoomMira: f.end })
);
vi.mock(
  '../../../../../features/live-assistant/server/room-mira-evidence',
  () => ({
    recordMiraChoice: f.record,
    readMiraBoxTickedByDefault: f.boxDefault,
    readOpenMiraAcceptanceRevision: f.openRevision,
  })
);
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
  user: { id: '00000000-0000-4000-8000-0000000000d4' },
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

import { MIRA_ROOM_NOTICE_VERSION as version } from '@tuturuuu/realtime/meet';
import { GET, POST } from './route';

const params = { params: Promise.resolve({ meetingId: 'room' }) };
const post = (body: unknown) =>
  POST(
    new Request('https://meet.test/mira-room', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    params
  );
const read = { version, choice: null, acceptance: null, ready: false };
const choice = (overrides: Record<string, unknown> = {}) => ({
  action: 'choice',
  choice: 'on',
  version,
  acceptanceRevision: 1,
  source: 'join',
  textHash: 'a'.repeat(64),
  locale: 'vi',
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  f.available.mockResolvedValue(true);
  f.room.mockResolvedValue(read);
  f.boxDefault.mockResolvedValue(true);
  f.record.mockResolvedValue(undefined);
});

it('hides Mira without touching the room when it is unavailable', async () => {
  f.available.mockResolvedValue(false);
  const response = await GET(new Request('https://meet.test/x'), params);
  expect(await response.json()).toEqual({ available: false });
  expect(f.room).not.toHaveBeenCalled();
});

it('reads the caller view with the workspace box default, guests included', async () => {
  f.boxDefault.mockResolvedValue(false);
  const response = await GET(new Request('https://meet.test/x'), params);
  expect(await response.json()).toEqual({
    available: true,
    ...read,
    boxTickedByDefault: false,
  });
  expect(f.room).toHaveBeenCalledWith(guestAccess, {
    action: 'mira.room.read',
  });
  expect(f.boxDefault).toHaveBeenCalledWith('ws');
});

it('records the caller final state, notice, text hash and locale as their own choice', async () => {
  await post(choice({ choice: 'off' }));
  expect(f.room).toHaveBeenCalledWith(guestAccess, {
    action: 'mira.room.choice',
    choice: 'off',
    version,
    acceptanceRevision: 1,
    source: 'join',
  });
  expect(f.record).toHaveBeenCalledWith({
    meetingId: 'room',
    wsId: 'ws',
    participantId: guestAccess.user.id,
    guest: true,
    choice: 'off',
    source: 'join',
    acceptanceRevision: 1,
    noticeVersion: version,
    textHash: 'a'.repeat(64),
    locale: 'vi',
  });
  for (const body of [
    choice({ version: 'old' }),
    choice({ accountId: 'someone-else' }),
    choice({ choice: 'leave' }),
    choice({ textHash: 'short' }),
    { action: 'accept', capabilities: ['chat'] },
  ])
    await expect(post(body)).rejects.toMatchObject({ status: 400 });
});

it('always lets a participant turn off, but on needs Mira available', async () => {
  f.available.mockResolvedValue(false);
  await expect(post(choice())).rejects.toMatchObject({ status: 403 });
  await post(choice({ choice: 'off' }));
  expect(f.room).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ action: 'mira.room.choice', choice: 'off' })
  );
});

it('falls back to off when an on choice cannot be stored durably', async () => {
  f.record.mockRejectedValue(new Error('db'));
  await expect(post(choice())).rejects.toMatchObject({ status: 503 });
  expect(f.room).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ action: 'mira.room.choice', choice: 'off' })
  );
});

it('records no evidence for a Join state the room refuses to turn back on', async () => {
  const { MeetCallAccessError } =
    await import('@tuturuuu/meet-core/features/call/lib/call-access');
  f.room.mockRejectedValue(new MeetCallAccessError(409, 'Confirm in the call'));
  await expect(post(choice())).rejects.toMatchObject({ status: 409 });
  expect(f.room).toHaveBeenCalledWith(
    guestAccess,
    expect.objectContaining({ choice: 'on', source: 'join' })
  );
  expect(f.record).not.toHaveBeenCalled();
});

it('routes acceptance, turning off and minor reports to the acceptance flow', async () => {
  await post({
    action: 'accept',
    capabilities: ['chat', 'captions'],
    audienceAdultConfirmed: true,
  });
  expect(f.accept).toHaveBeenCalledWith(guestAccess, ['chat', 'captions']);
  await post({ action: 'end' });
  expect(f.end).toHaveBeenCalledWith(guestAccess, 'turned_off');
  await post({ action: 'report_minor' });
  expect(f.end).toHaveBeenCalledWith(guestAccess, 'minor_reported');
});

it('gives a participant who is not admitted yet the join box default and the open revision', async () => {
  const { MeetCallAccessError } =
    await import('@tuturuuu/meet-core/features/call/lib/call-access');
  f.room.mockRejectedValue(new MeetCallAccessError(403, 'Join first'));
  f.boxDefault.mockResolvedValue(false);
  f.openRevision.mockResolvedValue(4);
  const response = await GET(new Request('https://meet.test/x'), params);
  expect(await response.json()).toEqual({
    available: false,
    joinDefault: false,
    joinRevision: 4,
  });
  // A failed default lookup shows the box unticked instead of failing.
  f.room.mockRejectedValue(new MeetCallAccessError(403, 'Join first'));
  f.boxDefault.mockRejectedValue(new Error('db'));
  expect(
    await (await GET(new Request('https://meet.test/x'), params)).json()
  ).toEqual({ available: false, joinDefault: false, joinRevision: 4 });
  f.room.mockRejectedValue(new MeetCallAccessError(503, 'Down'));
  await expect(
    GET(new Request('https://meet.test/x'), params)
  ).rejects.toMatchObject({ status: 503 });
});
