import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  available: vi.fn(),
  room: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock(
  '../../../../../features/live-assistant/server/room-mira-authority',
  () => ({ readRoomMiraAvailability: f.available })
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
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: f.room,
  guestPollRoomRoute: async (
    _request: Request,
    _id: string,
    run: (access: unknown) => Promise<unknown>
  ) => Response.json(await run({ user: { id: 'guest' }, guest: true })),
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
const read = { version, choice: null, fence: { ready: false, pending: 1 } };

beforeEach(() => {
  vi.resetAllMocks();
  f.available.mockResolvedValue(true);
  f.room.mockResolvedValue(read);
});

it('hides the notice without touching the room when room Mira is unavailable', async () => {
  f.available.mockResolvedValue(false);
  const response = await GET(new Request('https://meet.test/x'), params);
  expect(await response.json()).toEqual({ available: false });
  expect(f.room).not.toHaveBeenCalled();
});

it('reads only the caller view, guests included', async () => {
  const response = await GET(new Request('https://meet.test/x'), params);
  expect(await response.json()).toEqual({ available: true, ...read });
  expect(f.room).toHaveBeenCalledWith(
    { user: { id: 'guest' }, guest: true },
    { action: 'mira.room.read' }
  );
});

it('records only the caller choice for the current notice', async () => {
  await post({ choice: 'continue', version });
  expect(f.room).toHaveBeenCalledWith(expect.anything(), {
    action: 'mira.room.choice',
    choice: 'continue',
    version,
  });
  for (const body of [
    { choice: 'continue', version: 'old' },
    { choice: 'continue', version, accountId: 'someone-else' },
    { choice: 'leave', version },
  ])
    await expect(post(body)).rejects.toMatchObject({ status: 400 });
});

it('always lets a participant pause, but Continue needs room Mira available', async () => {
  f.available.mockResolvedValue(false);
  await expect(post({ choice: 'continue', version })).rejects.toMatchObject({
    status: 403,
  });
  await post({ choice: 'mute', version });
  expect(f.room).toHaveBeenCalledWith(expect.anything(), {
    action: 'mira.room.choice',
    choice: 'mute',
    version,
  });
});
