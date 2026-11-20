import { beforeEach, expect, it, vi } from 'vitest';

const ROOT = '00000000-0000-0000-0000-000000000000';
const MEETING_WS = '00000000-0000-4000-8000-0000000000a1';
const mocks = vi.hoisted(() => ({
  authority: vi.fn(),
  fence: vi.fn(),
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
  () => ({
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
  mocks.personal.mockResolvedValue('tagger-personal-workspace');
  mocks.model.mockResolvedValue({
    id: 'google/gemini-3.5-flash-lite',
    providerModelId: 'gemini-3.5-flash-lite',
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
    command.action === 'ai.reserve' ? context : { ok: true }
  );
});

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
  expect(options.provider).toEqual({ apiKey: 'synthetic-key' });
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
