vi.mock('./provider-transport', () => ({
  meetingProviderTransport: async () => ({}),
}));

import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  check: vi.fn(),
  begin: vi.fn(),
  settle: vi.fn(),
  step: vi.fn(),
  generate: vi.fn(),
  allocation: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: f.check,
}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({
  generateMeetArtifact: f.generate,
}));
vi.mock('@tuturuuu/ai/studio/metering', () => ({
  beginAiStudioRun: f.begin,
  settleAiStudioRun: f.settle,
  recordAiStudioRunStep: f.step,
}));
vi.mock('../../call/server/room-service', () => ({
  personalWorkspace: async () => 'personal-workspace',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      single: f.allocation,
    };
    return { from: () => query };
  },
}));
vi.mock('./access', () => ({
  MeetAiError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));

import { MeetAiGenerationError } from '@tuturuuu/ai/meetings/failure';
import { generateBilledMeetArtifact } from './artifact-billing';
import { isBillingUnknown, isSettledUncharged } from './notes-billing';

const actor = { userId: 'actor', meetingId: 'meeting', attemptId: 'attempt' };
beforeEach(() => {
  vi.resetAllMocks();
  f.check.mockResolvedValue({
    allowed: true,
    tier: 'FREE',
    maxOutputTokens: 2048,
  });
  f.allocation.mockResolvedValue({
    data: { markup_multiplier: 2 },
    error: null,
  });
  f.begin.mockResolvedValue({ runId: 'run', reservationId: 'reservation' });
  f.settle.mockResolvedValue(undefined);
  f.step.mockResolvedValue(undefined);
  f.generate.mockResolvedValue({
    costUsd: 0.001,
    usage: { available: true, inputTokens: 100, outputTokens: 20 },
    text: 'result',
  });
});
it('blocks the provider before reserving when credits are denied', async () => {
  f.check.mockResolvedValue({ allowed: false });
  await expect(
    generateBilledMeetArtifact({ transcript: 'hello' }, actor)
  ).rejects.toThrow('AI credits unavailable');
  expect(f.generate).not.toHaveBeenCalled();
  expect(f.begin).not.toHaveBeenCalled();
});
it('settles actual provider cost with plan markup in AI Hub without private content', async () => {
  await generateBilledMeetArtifact(
    { transcript: 'private conversation' },
    actor
  );
  expect(f.begin).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaceId: 'personal-workspace',
      actorId: 'actor',
      rejectExisting: true,
    })
  );
  expect(f.generate).toHaveBeenCalledWith(
    { transcript: 'private conversation' },
    { maxOutputTokens: 2048, provider: {} }
  );
  expect(f.settle).toHaveBeenCalledWith(
    expect.objectContaining({
      runId: 'run',
      actualCredits: 20,
      providerCostUsd: 0.001,
      inputTokens: 100,
      outputTokens: 20,
    })
  );
  expect(JSON.stringify(f.begin.mock.calls)).not.toContain(
    'private conversation'
  );
  expect(JSON.stringify(f.settle.mock.calls)).not.toContain(
    'private conversation'
  );
});
it('retries settlement with the same run without repeating the provider', async () => {
  f.settle
    .mockRejectedValueOnce(new Error('transport'))
    .mockResolvedValue(undefined);
  await generateBilledMeetArtifact({ audio: new Uint8Array(100) }, actor);
  expect(f.generate).toHaveBeenCalledOnce();
  expect(f.settle).toHaveBeenCalledTimes(2);
  expect(f.settle.mock.calls.map(([call]) => call.runId)).toEqual([
    'run',
    'run',
  ]);
});
it('does not return unmetered output or manufacture costs when provider accounting is absent', async () => {
  f.generate.mockResolvedValue({ costUsd: null, usage: { available: false } });
  await expect(
    generateBilledMeetArtifact({ transcript: 'hello' }, actor)
  ).rejects.toThrow('AI usage accounting unavailable');
  expect(f.settle).not.toHaveBeenCalled();
});
it('does not execute again when AI Hub rejects an existing attempt', async () => {
  f.begin.mockRejectedValue(new Error('already running'));
  await expect(
    generateBilledMeetArtifact({ transcript: 'hello' }, actor)
  ).rejects.toThrow('already running');
  expect(f.generate).not.toHaveBeenCalled();
});

it('tags only a definitive provider rejection as uncharged, after its failed settlement is recorded', async () => {
  const rejection = new MeetAiGenerationError('quota_exceeded', 429);
  f.generate.mockRejectedValue(rejection);
  const caught = await generateBilledMeetArtifact(
    { transcript: 'hello' },
    actor
  ).catch((error) => error);
  expect(caught).toBe(rejection);
  expect(isSettledUncharged(caught)).toBe(true);
  expect(isBillingUnknown(caught)).toBe(false);
  expect(f.settle).toHaveBeenCalledWith(
    expect.objectContaining({
      runId: 'run',
      status: 'failed',
      actualCredits: 0,
    })
  );
});

it('does not tag a missing-configuration failure as unknown: no request was ever made', async () => {
  const failure = new MeetAiGenerationError('missing_configuration');
  f.generate.mockRejectedValue(failure);
  const caught = await generateBilledMeetArtifact(
    { transcript: 'hello' },
    actor
  ).catch((error) => error);
  expect(isSettledUncharged(caught)).toBe(true);
});

it.each([
  ['a timeout', new MeetAiGenerationError('timeout', null)],
  ['an abort-style timeout from a plain error', new Error('provider timeout')],
  [
    'a network error after the request was sent',
    new MeetAiGenerationError('network_error', null),
  ],
  [
    'a post-generation parse or output error',
    new MeetAiGenerationError('runtime_error', null),
  ],
])(
  'treats %s as an unknown outcome even when the zero-credit settlement succeeds',
  async (_name, failure) => {
    f.generate.mockRejectedValue(failure);
    const caught = await generateBilledMeetArtifact(
      { transcript: 'hello' },
      actor
    ).catch((error) => error);
    // The original error is preserved for the host-facing failure code...
    expect(caught).toBe(failure);
    // ...but it can never allow another unattended provider call.
    expect(isSettledUncharged(caught)).toBe(false);
    expect(isBillingUnknown(caught)).toBe(true);
    // The reservation is still released at zero credits.
    expect(f.settle).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', actualCredits: 0 })
    );
    expect(f.generate).toHaveBeenCalledTimes(1);
  }
);

it('treats a lost or failed failure settlement as an unknown billed state', async () => {
  const failure = new Error('provider timeout');
  f.generate.mockRejectedValue(failure);
  f.settle.mockRejectedValue(new Error('settlement ack lost'));
  const caught = await generateBilledMeetArtifact(
    { transcript: 'hello' },
    actor
  ).catch((error) => error);
  expect(caught).not.toBe(failure);
  expect(caught).toMatchObject({ status: 503, code: 'billing_unreconciled' });
  // Neither the original error nor the wrapper may rotate an identity.
  expect(isSettledUncharged(caught)).toBe(false);
  expect(isSettledUncharged(failure)).toBe(false);
  expect(f.generate).toHaveBeenCalledTimes(1);
});
