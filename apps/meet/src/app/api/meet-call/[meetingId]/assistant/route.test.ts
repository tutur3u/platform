import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  personal: vi.fn(async () => 'tagger-personal-workspace'),
  service: vi.fn(async () => ({
    chat: [{ body: 'Recent context', displayName: 'Guest' }],
    prompt: '@Tuturuuu original question',
  })),
  check: vi.fn(async () => ({
    allowed: true,
    remainingCredits: 100,
    maxOutputTokens: 1024,
  })),
  cap: vi.fn(async () => 1024),
  answer: vi.fn(async () => ({
    text: 'Answer',
    costUsd: 0.001,
    usage: { available: true, inputTokens: 100, outputTokens: 20 },
  })),
  deduct: vi.fn(async () => ({ success: true })),
}));
vi.mock('server-only', () => ({}));
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
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: mocks.cap,
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.check,
  deductAiCredits: mocks.deduct,
}));
vi.mock('@tuturuuu/ai/meetings/chat', () => ({ answerMeetChat: mocks.answer }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
}));
vi.mock('@/features/call/server/room-service', () => ({
  personalWorkspace: mocks.personal,
  callRoomService: mocks.service,
  roomRoute: async (
    _request: Request,
    _id: string,
    run: (access: unknown) => Promise<unknown>
  ) =>
    Response.json(
      await run({
        user: { id: 'tagger' },
        meeting: { id: 'room', creator_id: 'creator' },
      })
    ),
}));

import { POST } from './route';

const request = () =>
  new Request('https://meet.test/api/meet-call/room/assistant', {
    method: 'POST',
    body: JSON.stringify({ messageId: 'message' }),
  });
beforeEach(() => vi.clearAllMocks());
it('charges the tagger personal quota and uses server-supplied recent chat', async () => {
  const response = await POST(request(), {
    params: Promise.resolve({ meetingId: 'room' }),
  });
  expect(response.status).toBe(200);
  expect(mocks.personal).toHaveBeenCalledWith('tagger');
  expect(mocks.deduct).toHaveBeenCalledWith(
    expect.objectContaining({
      wsId: 'tagger-personal-workspace',
      userId: 'tagger',
      inputTokens: 100,
      outputTokens: 20,
    })
  );
  expect(mocks.answer).toHaveBeenCalledWith(
    [{ body: 'Recent context', displayName: 'Guest' }],
    1024,
    '@Tuturuuu original question'
  );
  expect(mocks.service).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      action: 'ai.finish',
      costUsd: 0.001,
      body: 'Answer',
    })
  );
});
it('does not call Gemini when quota checks deny generation', async () => {
  mocks.check.mockResolvedValueOnce({
    allowed: false,
    remainingCredits: 0,
    maxOutputTokens: 0,
  });
  await expect(
    POST(request(), { params: Promise.resolve({ meetingId: 'room' }) })
  ).rejects.toMatchObject({ status: 403 });
  expect(mocks.answer).not.toHaveBeenCalled();
});
it('records provider cost even if quota deduction fails', async () => {
  mocks.deduct.mockResolvedValueOnce({ success: false });
  await expect(
    POST(request(), { params: Promise.resolve({ meetingId: 'room' }) })
  ).rejects.toMatchObject({ status: 503 });
  expect(mocks.service).toHaveBeenLastCalledWith(expect.anything(), {
    action: 'ai.finish',
    messageId: 'message',
    costUsd: 0.001,
  });
});
