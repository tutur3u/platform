import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const ROOT = '00000000-0000-0000-0000-000000000000';
const MEETING_WS = '00000000-0000-4000-8000-0000000000a1';
const mocks = vi.hoisted(() => ({
  authority: vi.fn(),
  fence: vi.fn(),
  verify: vi.fn(),
  release: vi.fn(),
  upstream: vi.fn(),
  model: vi.fn(),
  personal: vi.fn(),
  service: vi.fn(),
  check: vi.fn(),
  cap: vi.fn(),
  answer: vi.fn(),
  settle: vi.fn(),
  begin: vi.fn(),
}));
vi.mock(
  '../../../../../../../../packages/meet-core/src/features/live-assistant/server/room-mira-authority',
  async (importOriginal) => ({
    // The real guarded provider fetch; verification goes to mocks.service.
    ...(await importOriginal<object>()),
    requireRoomMiraAuthority: mocks.authority,
    requireRoomMiraFence: mocks.fence,
  })
);
vi.mock('@tuturuuu/ai/studio/metering', () => ({
  beginAiStudioRun: mocks.begin,
  settleAiStudioRun: mocks.settle,
  recordAiStudioRunStep: async () => {},
  calculateAiStudioUsageCost: async () => ({
    billedCredits: 10,
    providerCostUsd: 0.001,
  }),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({ withoutPermission: () => false }),
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));
vi.mock('@tuturuuu/ai/meetings/workspace-tools', () => ({
  createMeetWorkspaceTools: () => ({}),
}));
vi.mock('@tuturuuu/meet-core/features/call/server/chat-model', () => ({
  getMeetChatModel: mocks.model,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
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
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
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
        canReadWorkspace: true,
        meeting: { id: 'room', creator_id: 'creator', ws_id: MEETING_WS },
      })
    ),
}));

import { POST } from './route';

const post = (body: unknown) =>
  POST(
    new Request('https://meet.test/api/meet-call/room/assistant', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ meetingId: 'room' }) }
  );
const context = {
  chat: [{ body: 'Recent context', displayName: 'Guest' }],
  prompt: '@mira original question',
  meetingContext: {
    observedAt: '2026-11-20T00:00:00Z',
    participantCount: 2,
    deviceCount: 2,
    participants: [],
  },
};
const room = (payer: 'tuturuuu' | 'account') => ({
  payer,
  billingWorkspaceId: payer === 'tuturuuu' ? ROOT : MEETING_WS,
  apiKey: 'synthetic-key',
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authority.mockResolvedValue(room('account'));
  mocks.fence.mockResolvedValue(undefined);
  mocks.verify.mockResolvedValue({ ok: true, expiresInMs: 120_000 });
  mocks.release.mockResolvedValue({ current: true });
  // Each provider answer reports 100 input and 20 output tokens.
  mocks.upstream.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          candidates: [{}],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
        })
      )
  );
  vi.stubGlobal('fetch', mocks.upstream);
  mocks.personal.mockResolvedValue('tagger-personal-workspace');
  mocks.model.mockResolvedValue({
    id: 'google/gemini-3.5-flash-lite',
    providerModelId: 'gemini-3.5-flash-lite',
    inputPricePerToken: 0.3 / 1_000_000,
    outputPricePerToken: 2.5 / 1_000_000,
    cacheReadPricePerToken: null,
    tieredPricing: false,
  });
  mocks.check.mockResolvedValue({
    allowed: true,
    remainingCredits: 100,
    maxOutputTokens: 1024,
  });
  mocks.cap.mockResolvedValue(1024);
  mocks.begin.mockResolvedValue({ runId: 'run', reservationId: 'hold' });
  mocks.settle.mockResolvedValue(undefined);
  mocks.answer.mockResolvedValue({
    text: 'Answer',
    costUsd: 0.001,
    usage: { available: true, inputTokens: 100, outputTokens: 20 },
  });
  mocks.service.mockImplementation(async (_access, command) =>
    command.action === 'ai.reserve'
      ? context
      : command.action === 'mira.room.dispatch'
        ? mocks.verify(command)
        : command.action === 'mira.room.release'
          ? mocks.release(command)
          : { ok: true }
  );
  // Each provider request (three model steps and one search) uses the
  // provider fetch handed to the chat generator.
  mocks.answer.mockImplementation(async (...args: unknown[]) => {
    const options = args.at(-1) as { provider: { fetch: typeof fetch } };
    for (let request = 0; request < 4; request++)
      await options.provider.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/x'
      );
    return {
      text: 'Answer',
      costUsd: 0.001,
      usage: { available: true, inputTokens: 100, outputTokens: 20 },
    };
  });
});

afterEach(() => vi.unstubAllGlobals());

const noAiWork = () => {
  for (const mock of [
    mocks.check,
    mocks.answer,
    mocks.begin,
    mocks.settle,
    mocks.service,
  ])
    expect(mock).not.toHaveBeenCalled();
};

it.each([
  ['malformed JSON', '{'],
  ['legacy free-form body', { body: '@mira hi', audience: 'everyone' }],
  ['invalid timezone', { messageId: 'message', timezone: 'bad/timezone' }],
])('rejects %s before any room Mira work', async (_, body) => {
  await expect(post(body)).rejects.toMatchObject({ status: 400 });
  expect(mocks.authority).not.toHaveBeenCalled();
  noAiWork();
});

it('denies room chat before credits or context when room authority fails', async () => {
  mocks.authority.mockRejectedValue(
    Object.assign(new Error('Room Mira is unavailable'), { status: 403 })
  );
  await expect(post({ messageId: 'message' })).rejects.toMatchObject({
    status: 403,
  });
  expect(mocks.fence).not.toHaveBeenCalled();
  noAiWork();
});

it('waits for every participant before credits, context or provider', async () => {
  mocks.fence.mockRejectedValue(
    Object.assign(new Error('waiting'), {
      status: 409,
      code: 'MIRA_ROOM_CONSENT_REQUIRED',
    })
  );
  await expect(post({ messageId: 'message' })).rejects.toMatchObject({
    status: 409,
    code: 'MIRA_ROOM_CONSENT_REQUIRED',
  });
  noAiWork();
});

it.each([
  ['staff requester drains the root workspace', 'tuturuuu', ROOT],
  ['paid requester charges the meeting workspace', 'account', MEETING_WS],
] as const)('%s', async (_, payer, billed) => {
  mocks.authority.mockResolvedValue(room(payer));
  const response = await post({ messageId: 'message', timezone: 'UTC' });
  expect(await response.json()).toEqual({ ok: true });
  expect(mocks.check.mock.calls[0]?.[0]).toBe(billed);
  expect(mocks.begin).toHaveBeenCalledWith(
    expect.objectContaining({ actorId: 'tagger', workspaceId: billed })
  );
  // The provider key is the Worker's own; tools default to the requester's
  // Personal workspace, never the billing workspace.
  const options = mocks.answer.mock.calls[0]?.at(-1);
  expect(options.provider).toEqual({
    apiKey: 'synthetic-key',
    fetch: expect.any(Function),
  });
  expect(mocks.answer.mock.calls[0]?.[0]).toEqual(context.chat);
  expect(mocks.service).toHaveBeenCalledWith(expect.anything(), {
    action: 'ai.reserve',
    messageId: 'message',
  });
  expect(mocks.service).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ action: 'ai.finish', body: 'Answer' })
  );
  expect(mocks.fence.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.check.mock.invocationCallOrder[0]!
  );
});

it('never posts a blank answer and records incurred cost', async () => {
  mocks.answer.mockResolvedValueOnce({
    text: ' ',
    costUsd: 0,
    usage: { available: true, inputTokens: 0, outputTokens: 0 },
  });
  await expect(post({ messageId: 'message' })).rejects.toMatchObject({
    status: 503,
  });
  expect(mocks.service).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ action: 'ai.finish', costUsd: 0 })
  );
  expect(mocks.service).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ body: ' ' })
  );
});

it('verifies source consent before every provider request, including later steps and search', async () => {
  await post({ messageId: 'message' });
  expect(mocks.verify).toHaveBeenCalledTimes(4);
  expect(mocks.upstream).toHaveBeenCalledTimes(4);
  for (let request = 0; request < 4; request++)
    expect(mocks.verify.mock.invocationCallOrder[request]).toBeLessThan(
      mocks.upstream.mock.invocationCallOrder[request]!
    );
  const reserve = mocks.service.mock.calls.findIndex(
    ([, command]) => command.action === 'ai.reserve'
  );
  expect(mocks.service.mock.invocationCallOrder[reserve]).toBeLessThan(
    mocks.verify.mock.invocationCallOrder[0]!
  );
});

it('stops the next provider request when consent is withdrawn mid-generation', async () => {
  mocks.verify
    .mockResolvedValueOnce({ ok: true, expiresInMs: 120_000 })
    .mockResolvedValueOnce({ ok: true, expiresInMs: 120_000 })
    .mockRejectedValue(Object.assign(new Error('stale'), { status: 409 }));
  await expect(post({ messageId: 'message' })).rejects.toMatchObject({
    status: 409,
    code: 'MIRA_ROOM_CONSENT_REQUIRED',
  });
  // Two steps reached the provider; the third and the search never left.
  expect(mocks.upstream).toHaveBeenCalledTimes(2);
  // Both settlements carry the two answers' measured usage, never zero.
  const finish = mocks.service.mock.calls.at(-1)![1];
  expect(finish).toMatchObject({ action: 'ai.finish', messageId: 'message' });
  expect(finish.costUsd).toBeCloseTo(2 * (100 * 0.3e-6 + 20 * 2.5e-6), 9);
  expect(mocks.settle).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'failed',
      actualCredits: 10,
      inputTokens: 200,
      outputTokens: 40,
      metadata: expect.objectContaining({ usage_source: 'observed_partial' }),
    })
  );
  expect(mocks.service).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ body: expect.anything() })
  );
});

it('sends nothing and settles zero cost when consent is stale before the first request', async () => {
  mocks.verify.mockRejectedValue(
    Object.assign(new Error('stale'), { status: 409 })
  );
  await expect(post({ messageId: 'message' })).rejects.toMatchObject({
    status: 409,
    code: 'MIRA_ROOM_CONSENT_REQUIRED',
  });
  expect(mocks.upstream).not.toHaveBeenCalled();
  expect(mocks.service).toHaveBeenLastCalledWith(expect.anything(), {
    action: 'ai.finish',
    messageId: 'message',
    costUsd: 0,
  });
  expect(mocks.settle).toHaveBeenCalledWith(
    expect.objectContaining({
      actualCredits: 0,
      metadata: expect.objectContaining({ usage_source: 'unavailable' }),
    })
  );
});

it('discards an answer whose consent changed while it was in flight and settles its usage', async () => {
  mocks.release.mockResolvedValue({ current: false });
  await expect(post({ messageId: 'message' })).rejects.toMatchObject({
    status: 409,
    code: 'MIRA_ROOM_CONSENT_REQUIRED',
  });
  expect(mocks.upstream).toHaveBeenCalledTimes(1);
  expect(mocks.service.mock.calls.at(-1)![1].costUsd).toBeGreaterThan(0);
  expect(mocks.settle).toHaveBeenCalledWith(
    expect.objectContaining({
      inputTokens: 100,
      outputTokens: 20,
      metadata: expect.objectContaining({ usage_source: 'observed_partial' }),
    })
  );
  expect(mocks.service).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ body: expect.anything() })
  );
});

it('settles an answer without measurable usage once as unpriced in both receipts', async () => {
  mocks.answer.mockImplementationOnce(async () => ({
    text: 'Answer',
    costUsd: null,
    searchCount: 0,
    usage: { available: false, inputTokens: 0, outputTokens: 0 },
  }));
  await expect(post({ messageId: 'message' })).rejects.toMatchObject({
    status: 503,
  });
  // AI Studio: one settlement that captures exactly the reserved hold.
  expect(mocks.settle).toHaveBeenCalledTimes(1);
  const reserved = (
    mocks.begin.mock.calls[0] as unknown as [{ reservedCredits: number }]
  )[0].reservedCredits;
  expect(mocks.settle).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'failed',
      actualCredits: reserved,
      metadata: expect.objectContaining({ usage_source: 'unpriced_partial' }),
    })
  );
  // Room: the request finalizes as unpriced and posts nothing.
  expect(mocks.service).toHaveBeenLastCalledWith(expect.anything(), {
    action: 'ai.finish',
    messageId: 'message',
    costUsd: null,
  });
  expect(mocks.service).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ body: expect.anything() })
  );
});
