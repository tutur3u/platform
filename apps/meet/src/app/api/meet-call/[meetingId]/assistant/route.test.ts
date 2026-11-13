import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
  settle: vi.fn(async (_input: Record<string, unknown>) => undefined),
  begin: vi.fn(async () => ({ runId: 'run', reservationId: 'hold' })),
}));
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
        meeting: {
          id: 'room',
          creator_id: 'creator',
          ws_id: '00000000-0000-4000-8000-0000000000a1',
        },
      })
    ),
}));

import { POST } from './route';

// The Worker context crosses the app/core adapter package boundary.
const allowlist = (value: string | undefined) =>
  vi.stubGlobal(Symbol.for('__cloudflare-context__'), {
    env: {
      MEET_AI_PROTECTED_WORKSPACE_IDS: '00000000-0000-4000-8000-0000000000ee',
      MEET_AI_ENABLED_WORKSPACE_IDS: value,
      MEET_AI_DISABLED: value ? 'false' : 'true',
    },
  });
afterEach(() => {
  vi.unstubAllGlobals();
});

const request = () =>
  new Request('https://meet.test/api/meet-call/room/assistant', {
    method: 'POST',
    body: JSON.stringify({ messageId: 'message' }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  allowlist('00000000-0000-4000-8000-0000000000a1');
});

const noAiWork = () => {
  for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
};
it.each([
  ['personal billing and recent room context', { messageId: 'message' }],
  ['quota denied', { messageId: 'message' }],
  ['settlement unavailable', { messageId: 'message' }],
  ['duplicate settlement retry', { messageId: 'message' }],
  ['malformed JSON', '{'],
  [
    'private preview with no settlement retry',
    { messageId: 'message', privateResult: true },
  ],
  [
    'private preview after three uncertain settlements',
    { messageId: 'message', privateResult: true },
  ],
  ['invalid timezone', { messageId: 'message', timezone: 'bad/timezone' }],
  ['blank model answer', { messageId: 'message' }],
  [
    'persisted Continue cannot enable room chat',
    { messageId: 'message', choice: 'continue' },
  ],
])(
  'denies room chat before %s can reach credits, context, provider or publication',
  async (scenario, body) => {
    if (scenario === 'quota denied')
      mocks.check.mockResolvedValueOnce({
        allowed: false,
        remainingCredits: 0,
        maxOutputTokens: 0,
      });
    if (scenario === 'settlement unavailable')
      mocks.settle.mockRejectedValueOnce(
        new Error('Synthetic settlement unavailable')
      );
    if (scenario === 'duplicate settlement retry')
      mocks.service.mockRejectedValueOnce(new Error('Synthetic response lost'));
    if (scenario === 'blank model answer')
      mocks.answer.mockResolvedValueOnce({
        text: ' ',
        costUsd: 0,
        usage: { available: true, inputTokens: 0, outputTokens: 0 },
      });
    await expect(
      POST(
        new Request('https://meet.test/api/meet-call/room/assistant', {
          method: 'POST',
          body: typeof body === 'string' ? body : JSON.stringify(body),
        }),
        { params: Promise.resolve({ meetingId: 'room' }) }
      )
    ).rejects.toMatchObject({
      status: 403,
      message:
        'Room AI chat is unavailable. Use Private Mira after choosing Continue.',
    });
    noAiWork();
  }
);
it.each(['invalid JSON', JSON.stringify({ messages: [], context: {} })])(
  'denies a saved continuation before reading or settling it: %s',
  async (continuation) => {
    const { generateMeetAssistant } =
      await import('@tuturuuu/meet-core/features/call/server/assistant-generation');
    mocks.service.mockResolvedValueOnce({
      workspaceId: 'workspace',
      continuation,
      approvals: [],
      timezone: 'UTC',
    } as never);
    await expect(
      generateMeetAssistant(
        {
          user: { id: 'tagger' },
          meeting: {
            id: 'room',
            ws_id: '00000000-0000-4000-8000-0000000000a1',
          },
        } as never,
        {
          messageId: 'message',
          timezone: 'UTC',
          resume: { revision: 1, approved: true },
        }
      )
    ).rejects.toMatchObject({
      status: 403,
      message: 'Meet AI is temporarily unavailable',
    });
    noAiWork();
  }
);
it('denies room chat across every runtime allowlist and kill-switch setting', async () => {
  for (const value of [
    undefined,
    '',
    '*',
    '00000000-0000-4000-8000-0000000000a1',
  ]) {
    allowlist(value);
    await expect(
      POST(request(), { params: Promise.resolve({ meetingId: 'room' }) })
    ).rejects.toMatchObject({ status: 403 });
  }
  noAiWork();
});
