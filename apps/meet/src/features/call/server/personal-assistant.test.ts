import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  answer: vi.fn(async () => ({
    text: 'Private reply',
    searchCount: 0,
    usage: { available: true, inputTokens: 10, outputTokens: 20 },
  })),
  check: vi.fn(async () => ({
    allowed: true,
    remainingCredits: 100,
    maxOutputTokens: 1024,
  })),
  deduct: vi.fn(async () => ({ success: true })),
  service: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./room-service', () => ({
  personalWorkspace: async () => 'requester-workspace',
  callRoomService: mocks.service,
}));
vi.mock('./chat-model', () => ({
  getMeetChatModel: async () => ({ id: 'google/test' }),
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.check,
  deductAiCredits: mocks.deduct,
}));
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: async () => 1024,
}));
vi.mock('@tuturuuu/ai/meetings/chat', () => ({ answerMeetChat: mocks.answer }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
}));
vi.mock('../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import { answerPersonalMeetChat } from './personal-assistant';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.check.mockResolvedValue({
    allowed: true,
    remainingCredits: 100,
    maxOutputTokens: 1024,
  });
});
it('returns only private context, charges the requester and never publishes to the room', async () => {
  expect(
    await answerPersonalMeetChat('requester', {
      question: 'My private question',
      timezone: 'UTC',
      history: [],
    })
  ).toEqual({ text: 'Private reply' });
  expect(mocks.service).not.toHaveBeenCalled();
  expect(mocks.answer.mock.calls[0]).toEqual([
    [],
    1024,
    'My private question',
    { id: 'google/test' },
    expect.objectContaining({
      participants: [],
      title: 'Personal conversation',
    }),
    { audience: 'private' },
  ]);
  expect(mocks.deduct).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 'requester',
      wsId: 'requester-workspace',
      metadata: { source: 'meet_mira_personal' },
    })
  );
});
it('does not call the provider when the requester has no quota', async () => {
  mocks.check.mockResolvedValue({
    allowed: false,
    remainingCredits: 0,
    maxOutputTokens: 0,
  });
  await expect(
    answerPersonalMeetChat('requester', {
      question: 'Hello',
      timezone: 'UTC',
      history: [],
    })
  ).rejects.toThrow('AI quota');
  expect(mocks.answer).not.toHaveBeenCalled();
});
