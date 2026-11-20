import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  begin: vi.fn(),
  settle: vi.fn(),
  step: vi.fn(),
  price: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../runtime', () => ({ MEETING_APP: 'meet' }));
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
vi.mock('@tuturuuu/ai/studio/metering', () => ({
  beginAiStudioRun: f.begin,
  settleAiStudioRun: f.settle,
  recordAiStudioRunStep: f.step,
  calculateAiStudioUsageCost: f.price,
}));

import { billMeetChat, withObservedUsage } from './chat-billing';

const model = {
  id: 'google/gemini-3.1-flash-lite',
  providerModelId: 'gemini-3.1-flash-lite',
} as never;
const input = {
  userId: 'requester',
  workspaceId: 'billing-workspace',
  model,
  maxOutputTokens: 1024,
  inputBudget: 10000,
  remainingCredits: 1000,
  requestId: 'request',
  meetingId: 'meeting',
  allowSearch: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  f.begin.mockResolvedValue({ runId: 'run', reservationId: 'hold' });
  f.settle.mockResolvedValue(undefined);
  // The reservation estimate is 40 credits; measured usage costs 12.
  f.price.mockImplementation(async (cost: { inputTokens?: number }) =>
    cost.inputTokens === 10000
      ? { billedCredits: 40, providerCostUsd: 0.004 }
      : { billedCredits: 12, providerCostUsd: 0.0012 }
  );
});

const fail = (observed: Parameters<typeof withObservedUsage>[1]) =>
  billMeetChat(input, async () => {
    throw withObservedUsage(new Error('consent withdrawn'), observed);
  });

it('bills measured usage of answers received before a consent refusal', async () => {
  await expect(
    fail({
      costUsd: 0.0012,
      searchCount: 0,
      usage: { available: true, inputTokens: 200, outputTokens: 40 },
    })
  ).rejects.toThrow('consent withdrawn');
  expect(f.price).toHaveBeenLastCalledWith(
    expect.objectContaining({ inputTokens: 200, outputTokens: 40 })
  );
  expect(f.settle).toHaveBeenCalledWith(
    expect.objectContaining({
      runId: 'run',
      status: 'failed',
      actualCredits: 12,
      providerCostUsd: 0.0012,
      inputTokens: 200,
      outputTokens: 40,
      metadata: expect.objectContaining({ usage_source: 'observed_partial' }),
    })
  );
});

it('keeps the reserved hold when usage of a received answer is unknown', async () => {
  await expect(
    fail({
      costUsd: null,
      searchCount: 0,
      usage: { available: false, inputTokens: 0, outputTokens: 0 },
    })
  ).rejects.toThrow();
  expect(f.settle).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'failed',
      actualCredits: 40,
      metadata: expect.objectContaining({ usage_source: 'unpriced_partial' }),
    })
  );
});

it('never bills more than the hold and bills nothing when no answer was received', async () => {
  f.price.mockImplementation(async (cost: { inputTokens?: number }) =>
    cost.inputTokens === 10000
      ? { billedCredits: 40, providerCostUsd: 0.004 }
      : { billedCredits: 90, providerCostUsd: 0.009 }
  );
  await expect(
    fail({
      costUsd: 0.009,
      searchCount: 0,
      usage: { available: true, inputTokens: 900, outputTokens: 90 },
    })
  ).rejects.toThrow();
  expect(f.settle).toHaveBeenLastCalledWith(
    expect.objectContaining({ actualCredits: 40 })
  );
  await expect(fail(null)).rejects.toThrow();
  expect(f.settle).toHaveBeenLastCalledWith(
    expect.objectContaining({
      actualCredits: 0,
      metadata: expect.objectContaining({ usage_source: 'unavailable' }),
    })
  );
});

it('settles an answer without measurable usage once, through the unpriced hold', async () => {
  await expect(
    billMeetChat(input, async () => ({
      text: 'Answer',
      costUsd: null,
      searchCount: 0,
      usage: { available: false, inputTokens: 0, outputTokens: 0 },
    }))
  ).rejects.toMatchObject({ status: 503 });
  expect(f.settle).toHaveBeenCalledTimes(1);
  expect(f.settle).toHaveBeenCalledWith(
    expect.objectContaining({
      runId: 'run',
      status: 'failed',
      actualCredits: 40,
      metadata: expect.objectContaining({ usage_source: 'unpriced_partial' }),
    })
  );
  expect(f.step).not.toHaveBeenCalled();
});
