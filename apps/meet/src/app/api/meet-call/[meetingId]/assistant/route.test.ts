import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  model: vi.fn(async () => ({
    id: 'google/gemini-3.5-flash-lite',
    providerModelId: 'gemini-3.5-flash-lite',
    inputPricePerToken: 0.3 / 1_000_000,
    outputPricePerToken: 2.5 / 1_000_000,
    cacheReadPricePerToken: null,
    tieredPricing: false,
  })),
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
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({ withoutPermission: () => false }),
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));
vi.mock('@tuturuuu/ai/meetings/workspace-tools', () => ({
  createMeetWorkspaceTools: () => ({}),
}));
vi.mock('@/features/call/server/chat-model', () => ({
  getMeetChatModel: mocks.model,
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
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: mocks.cap,
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.check,
  deductAiCredits: mocks.deduct,
}));
vi.mock('@tuturuuu/ai/meetings/chat', () => ({ answerMeetChat: mocks.answer }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { name: 'Personal' } }) }),
      }),
    }),
  }),
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
  expect(mocks.model).toHaveBeenCalledWith('tagger-personal-workspace');
  expect(mocks.check).toHaveBeenCalledWith(
    'tagger-personal-workspace',
    'google/gemini-3.5-flash-lite',
    'chat',
    expect.objectContaining({ userId: 'tagger' })
  );
  expect(mocks.cap).toHaveBeenCalledWith(
    expect.anything(),
    'google/gemini-3.5-flash-lite',
    1024,
    100
  );
  expect(mocks.deduct).toHaveBeenCalledWith(
    expect.objectContaining({
      wsId: 'tagger-personal-workspace',
      modelId: 'google/gemini-3.5-flash-lite',
      userId: 'tagger',
      inputTokens: 100,
      outputTokens: 20,
    })
  );
  expect(mocks.answer).toHaveBeenCalledWith(
    [{ body: 'Recent context', displayName: 'Guest' }],
    1024,
    '@Tuturuuu original question',
    expect.objectContaining({
      id: 'google/gemini-3.5-flash-lite',
      providerModelId: 'gemini-3.5-flash-lite',
    }),
    expect.objectContaining({ timezone: 'UTC' }),
    expect.objectContaining({ workspaceTools: {} })
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
it('retries settlement with the answer without charging or generating twice', async () => {
  mocks.service
    .mockResolvedValueOnce({ chat: [], prompt: '@Tuturuuu question' })
    .mockRejectedValueOnce(new Error('Response lost'));
  const response = await POST(request(), {
    params: Promise.resolve({ meetingId: 'room' }),
  });
  expect(response.status).toBe(200);
  expect(mocks.answer).toHaveBeenCalledOnce();
  expect(mocks.deduct).toHaveBeenCalledOnce();
  expect(mocks.service).toHaveBeenLastCalledWith(expect.anything(), {
    action: 'ai.finish',
    messageId: 'message',
    body: 'Answer',
    costUsd: 0.001,
  });
});
it('rejects malformed JSON before checking quota or generating', async () => {
  await expect(
    POST(
      new Request('https://meet.test/assistant', { method: 'POST', body: '{' }),
      { params: Promise.resolve({ meetingId: 'room' }) }
    )
  ).rejects.toMatchObject({ status: 400 });
  expect(mocks.answer).not.toHaveBeenCalled();
  expect(mocks.check).not.toHaveBeenCalled();
});
it('saves private previews without publishing their body to the room', async () => {
  mocks.answer.mockResolvedValueOnce({
    text: 'Private task',
    costUsd: 0.001,
    usage: { available: true, inputTokens: 100, outputTokens: 20 },
    privateResult: true,
    messages: [],
    approvals: [],
  } as never);
  const response = await POST(request(), {
    params: Promise.resolve({ meetingId: 'room' }),
  });
  expect(await response.json()).toEqual({ ok: true, reviewId: 'message' });
  expect(mocks.service).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      action: 'ai.review.save',
      review: expect.objectContaining({ text: 'Private task' }),
    })
  );
  expect(mocks.service).toHaveBeenCalledTimes(2);
});
it('rejects invalid timezones before generation', async () => {
  await expect(
    POST(
      new Request('https://meet.test/assistant', {
        method: 'POST',
        body: JSON.stringify({
          messageId: 'message',
          timezone: 'bad/timezone',
        }),
      }),
      { params: Promise.resolve({ meetingId: 'room' }) }
    )
  ).rejects.toMatchObject({ status: 400 });
  expect(mocks.answer).not.toHaveBeenCalled();
});

it.each(['invalid JSON', JSON.stringify({ messages: [], context: {} })])(
  'settles a claimed review when its saved continuation is malformed: %s',
  async (continuation) => {
    const { generateMeetAssistant } = await import(
      '@/features/call/server/assistant-generation'
    );
    const review = {
      workspaceId: 'workspace',
      continuation,
      approvals: [],
      timezone: 'UTC',
    };
    mocks.service
      .mockResolvedValueOnce(review as never)
      .mockResolvedValueOnce(review as never);
    await expect(
      generateMeetAssistant(
        { user: { id: 'tagger' }, meeting: { id: 'room' } } as never,
        {
          messageId: 'message',
          timezone: 'UTC',
          resume: { revision: 1, approved: true },
        }
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.service).toHaveBeenLastCalledWith(expect.anything(), {
      action: 'ai.finish',
      messageId: 'message',
      costUsd: 0,
    });
    expect(mocks.answer).not.toHaveBeenCalled();
  }
);
