import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ service: vi.fn(), generate: vi.fn() }));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('@/features/call/server/assistant-generation', () => ({
  generateMeetAssistant: mocks.generate,
}));
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
  callRoomService: mocks.service,
  roomRoute: async (
    _req: unknown,
    _id: unknown,
    run: (access: unknown) => Promise<unknown>
  ) => Response.json(await run({ user: { id: 'requester' } })),
}));

import { GET, POST } from './route';

const params = { params: Promise.resolve({ meetingId: 'room' }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.service.mockResolvedValue({
    text: 'Private',
    continuation: 'secret-provider-signatures',
    approvals: [],
    revision: 1,
    status: 'ready',
  });
  mocks.generate.mockResolvedValue({ ok: true, reviewId: 'message' });
});
it('returns private display data without the provider continuation', async () => {
  const response = await GET(
    new Request('https://meet.test/review?messageId=message'),
    params
  );
  expect(await response.json()).toEqual({
    text: 'Private',
    approvals: [],
    revision: 1,
    status: 'ready',
  });
});
it('lists only through the requester-scoped room service', async () => {
  await GET(new Request('https://meet.test/review'), params);
  expect(mocks.service).toHaveBeenCalledWith(
    { user: { id: 'requester' } },
    { action: 'ai.review.list' }
  );
});
it('passes explicit approval and revision to the protected continuation flow', async () => {
  await POST(
    new Request('https://meet.test/review', {
      method: 'POST',
      body: JSON.stringify({
        messageId: 'message',
        revision: 1,
        action: 'approve',
        body: 'forged',
        continuation: 'forged',
      }),
    }),
    params
  );
  expect(mocks.generate).toHaveBeenCalledWith(
    { user: { id: 'requester' } },
    {
      messageId: 'message',
      timezone: 'UTC',
      resume: { revision: 1, approved: true },
    }
  );
});
it('never accepts client-authored replacement content when sharing', async () => {
  await POST(
    new Request('https://meet.test/review', {
      method: 'POST',
      body: JSON.stringify({
        messageId: 'message',
        revision: 1,
        action: 'share',
        body: 'forged',
      }),
    }),
    params
  );
  expect(mocks.service).toHaveBeenCalledWith(
    { user: { id: 'requester' } },
    { action: 'ai.review.share', messageId: 'message', revision: 1 }
  );
});
it('rejects invalid review ids before accessing the room', async () => {
  await expect(
    GET(new Request('https://meet.test/review?messageId='), params)
  ).rejects.toMatchObject({ status: 400 });
  expect(mocks.service).not.toHaveBeenCalled();
});
