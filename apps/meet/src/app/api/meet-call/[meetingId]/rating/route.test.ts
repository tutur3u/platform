import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  service: vi.fn(async (_access: unknown, _command: unknown) => ({
    rating: 4 as number | null,
  })),
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
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
  callRoomService: mocks.service,
  roomRoute: async (
    _request: Request,
    _id: string,
    run: (access: unknown) => Promise<unknown>
  ) => {
    try {
      return Response.json(await run({ user: { id: 'viewer' } }));
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: (error as { status?: number }).status ?? 500 }
      );
    }
  },
}));

import { GET, PUT } from './route';

const params = { params: Promise.resolve({ meetingId: 'room' }) };
const put = (body: unknown) =>
  PUT(
    new Request('https://meet.test/rating', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    params
  );

beforeEach(() => mocks.service.mockClear());

it('reads only the caller rating through the signed room service', async () => {
  mocks.service.mockResolvedValueOnce({ rating: null });
  const response = await GET(new Request('https://meet.test/rating'), params);
  expect(await response.json()).toEqual({ rating: null });
  expect(mocks.service.mock.calls[0]?.[1]).toEqual({ action: 'rating.read' });
});

it('forwards a valid 1–5 rating', async () => {
  const response = await put({ value: 4 });
  expect(await response.json()).toEqual({ rating: 4 });
  expect(mocks.service.mock.calls[0]?.[1]).toEqual({
    action: 'rating.set',
    value: 4,
  });
});

it('rejects invalid ratings before reaching the room', async () => {
  for (const body of [{ value: 0 }, { value: 6 }, { value: 2.5 }, {}, null]) {
    expect((await put(body)).status).toBe(400);
  }
  expect(mocks.service.mock.calls).toHaveLength(0);
});
