import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  answer: vi.fn(),
  check: vi.fn(),
  begin: vi.fn(),
  settle: vi.fn(),
  step: vi.fn(),
  price: vi.fn(),
  service: vi.fn(),
  app: 'meet' as 'meet' | 'parley',
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../runtime', () => ({
  get MEETING_APP() {
    return f.app;
  },
}));
vi.mock('@tuturuuu/ai/studio/metering', () => ({
  beginAiStudioRun: f.begin,
  settleAiStudioRun: f.settle,
  recordAiStudioRunStep: f.step,
  calculateAiStudioUsageCost: f.price,
}));
vi.mock('../../meeting-ai/server/provider-transport', () => ({
  meetingProviderTransport: async () => ({}),
}));
vi.mock('./room-service', () => ({
  personalWorkspace: async () => 'requester-workspace',
  callRoomService: f.service,
}));
vi.mock('./chat-model', () => ({
  getMeetChatModel: async () => ({
    id: 'google/test',
    providerModelId: 'gemini-3.1-flash-lite',
  }),
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: f.check,
}));
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: async () => 1024,
}));
vi.mock('@tuturuuu/ai/meetings/chat', () => ({ answerMeetChat: f.answer }));
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

const input = {
  question: 'Synthetic private question',
  timezone: 'UTC',
  history: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  f.app = 'meet';
  f.settle.mockResolvedValue(undefined);
  f.step.mockResolvedValue(undefined);
  f.answer.mockResolvedValue({
    text: 'Private reply',
    searchCount: 0,
    usage: { available: true, inputTokens: 10, outputTokens: 20 },
  });
  f.check.mockResolvedValue({
    allowed: true,
    remainingCredits: 100,
    maxOutputTokens: 1024,
  });
  f.price.mockResolvedValue({ billedCredits: 30, providerCostUsd: 0.003 });
  f.begin.mockResolvedValue({ runId: 'run', reservationId: 'hold' });
});
it('charges only the requester through AI Hub and never publishes private context', async () => {
  expect(await answerPersonalMeetChat('requester', input)).toEqual({
    text: 'Private reply',
  });
  expect(f.service).not.toHaveBeenCalled();
  expect(f.answer.mock.calls[0]?.at(-1)).toEqual({
    audience: 'private',
    provider: {},
    allowSearch: true,
  });
  expect(f.begin).toHaveBeenCalledWith(
    expect.objectContaining({
      actorId: 'requester',
      workspaceId: 'requester-workspace',
      metadata: { app: 'meet', source: 'meet_mira_personal' },
      rejectExisting: true,
    })
  );
  expect(JSON.stringify(f.begin.mock.calls)).not.toContain(input.question);
  expect(f.begin.mock.invocationCallOrder[0]).toBeLessThan(
    f.answer.mock.invocationCallOrder[0]!
  );
  expect(f.settle).toHaveBeenCalledWith(
    expect.objectContaining({
      runId: 'run',
      actualCredits: 30,
      inputTokens: 10,
      outputTokens: 20,
      status: 'succeeded',
    })
  );
});
it('never runs a provider without quota', async () => {
  f.check.mockResolvedValue({ allowed: false });
  await expect(answerPersonalMeetChat('requester', input)).rejects.toThrow(
    'AI quota'
  );
  expect(f.answer).not.toHaveBeenCalled();
});
it('rejects a concurrent request when the atomic reservation consumes the available quota', async () => {
  f.begin
    .mockResolvedValueOnce({ runId: 'run', reservationId: 'hold' })
    .mockRejectedValueOnce(new Error('quota reserved'));
  const results = await Promise.allSettled([
    answerPersonalMeetChat('requester', input),
    answerPersonalMeetChat('requester', input),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([
    'fulfilled',
    'rejected',
  ]);
  expect(f.answer).toHaveBeenCalledOnce();
});
it('settles against its own hold near quota and disables unaffordable optional search', async () => {
  f.check.mockResolvedValue({
    allowed: true,
    remainingCredits: 30,
    maxOutputTokens: 1024,
  });
  expect(await answerPersonalMeetChat('requester', input)).toHaveProperty(
    'text'
  );
  expect(f.begin.mock.calls[0]![0].reservedCredits).toBe(30);
  expect(f.answer.mock.calls[0]?.at(-1).allowSearch).toBe(false);
  expect(f.settle.mock.calls[0]![0].actualCredits).toBe(30);
});
it('reserves a bounded search budget but settles only actual query usage', async () => {
  f.answer.mockResolvedValueOnce({
    text: 'Grounded reply',
    searchCount: 3,
    usage: { available: true, inputTokens: 10, outputTokens: 20 },
  });
  await answerPersonalMeetChat('requester', input);
  expect(f.begin.mock.calls[0]![0].reservedCredits).toBe(60);
  expect(f.price).toHaveBeenCalledWith(
    expect.objectContaining({ searchCount: 3, inputTokens: 10 })
  );
  expect(f.settle.mock.calls[0]![0].metadata.search_count).toBe(3);
});
it('releases the reservation on provider failure without inventing usage', async () => {
  f.answer.mockRejectedValueOnce(new Error('provider unavailable'));
  await expect(answerPersonalMeetChat('requester', input)).rejects.toThrow(
    'provider unavailable'
  );
  expect(f.settle).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'failed', actualCredits: 0 })
  );
});
it('retries settlement with the same run without regenerating or double billing', async () => {
  f.settle
    .mockRejectedValueOnce(new Error('transport'))
    .mockResolvedValue(undefined);
  await answerPersonalMeetChat('requester', input);
  expect(f.answer).toHaveBeenCalledOnce();
  expect(f.settle.mock.calls.map(([call]) => call.runId)).toEqual([
    'run',
    'run',
  ]);
});
it('keeps unknown usage reserved for reconciliation and withholds the output', async () => {
  f.answer.mockResolvedValueOnce({
    text: 'answer',
    searchCount: 0,
    usage: { available: false },
  });
  await expect(
    answerPersonalMeetChat('requester', input)
  ).rejects.toMatchObject({ status: 503 });
  expect(f.settle).not.toHaveBeenCalled();
});
it('accounts for empty output before reporting the provider failure', async () => {
  f.answer.mockResolvedValueOnce({
    text: '',
    searchCount: 0,
    usage: { available: true, inputTokens: 10, outputTokens: 20 },
  });
  await expect(
    answerPersonalMeetChat('requester', input)
  ).rejects.toMatchObject({ status: 503 });
  expect(f.settle).toHaveBeenCalledOnce();
  expect(f.service).not.toHaveBeenCalled();
});
it('attributes Parley runs and disables public search regardless of available credits', async () => {
  f.app = 'parley';
  await answerPersonalMeetChat('requester', input);
  expect(f.answer.mock.calls[0]?.at(-1).allowSearch).toBe(false);
  expect(f.begin.mock.calls[0]![0].metadata).toEqual({
    app: 'parley',
    source: 'parley_mira_personal',
  });
});

it('returns a paid answer when only optional step recording is unavailable', async () => {
  f.step.mockRejectedValueOnce(new Error('step transport'));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect(await answerPersonalMeetChat('requester', input)).toHaveProperty(
      'text'
    );
    expect(f.settle).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledOnce();
  } finally {
    warning.mockRestore();
  }
});
