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
      message: string
    ) {
      super(message);
    }
  },
}));

import { generateBilledMeetArtifact } from './artifact-billing';

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
