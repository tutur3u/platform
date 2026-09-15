import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ host: true, policy: vi.fn() }));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('@/features/call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@/features/call/server/room-service', () => ({
  roomRoute: async (
    request: Request,
    _meetingId: string,
    run: (access: unknown) => Promise<unknown>
  ) => {
    if (
      request.method !== 'GET' &&
      request.headers.get('origin') !== new URL(request.url).origin
    )
      return new Response(null, { status: 403 });
    try {
      return Response.json(
        await run({
          isHost: mocks.host,
          user: { id: 'host' },
          meeting: { ws_id: 'workspace', name: 'Demo' },
        })
      );
    } catch (error) {
      return new Response(null, {
        status: (error as { status: number }).status,
      });
    }
  },
}));
vi.mock('@/features/meeting-ai/server/room-access', () => ({
  readMeetingRoomPolicy: mocks.policy,
}));

import { GET, PATCH } from './route';

const context = { params: Promise.resolve({ meetingId: 'meeting' }) };
const url = 'https://meet.tuturuuu.com/api/meet-call/meeting/public-info';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.host = true;
  mocks.policy.mockResolvedValue({ settings: { publicLinkPreview: true } });
});
it('only allows the verified host to read or change visibility', async () => {
  mocks.host = false;
  expect((await GET(new Request(url), context)).status).toBe(403);
  expect(
    (
      await PATCH(
        new Request(url, {
          method: 'PATCH',
          headers: { origin: 'https://meet.tuturuuu.com' },
          body: JSON.stringify({ publicLinkPreview: true }),
        }),
        context
      )
    ).status
  ).toBe(403);
  expect(mocks.policy).not.toHaveBeenCalled();
});
it('passes only the explicit visibility field into persisted room settings', async () => {
  const response = await PATCH(
    new Request(url, {
      method: 'PATCH',
      headers: { origin: 'https://meet.tuturuuu.com' },
      body: JSON.stringify({ publicLinkPreview: true }),
    }),
    context
  );
  expect(response.status).toBe(200);
  expect(mocks.policy).toHaveBeenCalledWith(
    { meetingId: 'meeting', wsId: 'workspace', userId: 'host', isHost: true },
    { publicLinkPreview: true }
  );
});
it.each([
  { publicLinkPreview: true, shareNotes: true },
  { publicLinkPreview: 'yes' },
])('rejects invalid or unrelated setting writes', async (body) => {
  expect(
    (
      await PATCH(
        new Request(url, {
          method: 'PATCH',
          headers: { origin: 'https://meet.tuturuuu.com' },
          body: JSON.stringify(body),
        }),
        context
      )
    ).status
  ).toBe(400);
  expect(mocks.policy).not.toHaveBeenCalled();
});
