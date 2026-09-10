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
  reserve: vi.fn(),
  release: vi.fn(async () => ({ success: true })),
}));
vi.mock('@tuturuuu/ai/credits/reservations', () => ({
  reserveFixedAiCredits: mocks.reserve,
  releaseFixedAiCreditReservation: mocks.release,
}));
vi.mock('@tuturuuu/ai/studio/metering', () => ({
  calculateAiStudioUsageCost: async () => ({
    billedCredits: 30,
    providerCostUsd: 0.003,
  }),
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
  mocks.reserve.mockResolvedValue({ success: true, reservationId: 'hold' });
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
    { audience: 'private', beforeSearch: expect.any(Function) },
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

it('holds quota until actual usage is deducted, then releases the hold', async () => {
  await answerPersonalMeetChat('requester', {
    question: 'Hello',
    timezone: 'UTC',
    history: [],
  });
  expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.answer.mock.invocationCallOrder[0]!
  );
  expect(mocks.deduct.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.release.mock.invocationCallOrder[0]!
  );
});
it('rejects a concurrent request when the atomic reservation has consumed the available quota', async () => {
  mocks.reserve
    .mockResolvedValueOnce({ success: true, reservationId: 'hold' })
    .mockResolvedValueOnce({ success: false });
  const input = { question: 'Hello', timezone: 'UTC', history: [] };
  const results = await Promise.allSettled([
    answerPersonalMeetChat('requester', input),
    answerPersonalMeetChat('requester', input),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([
    'fulfilled',
    'rejected',
  ]);
  expect(mocks.answer).toHaveBeenCalledOnce();
  expect(mocks.release).toHaveBeenCalledOnce();
});
it('releases the hold on provider failure without inventing usage', async () => {
  mocks.answer.mockRejectedValueOnce(new Error('provider unavailable'));
  await expect(
    answerPersonalMeetChat('requester', {
      question: 'Hello',
      timezone: 'UTC',
      history: [],
    })
  ).rejects.toThrow('provider unavailable');
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(mocks.deduct).not.toHaveBeenCalled();
});
