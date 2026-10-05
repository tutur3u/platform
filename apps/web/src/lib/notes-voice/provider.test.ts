// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  allowance: vi.fn(),
  begin: vi.fn(),
  settle: vi.fn(),
  generate: vi.fn(),
  markup: 2,
}));
vi.mock('server-only', () => ({}));
vi.mock('@ai-sdk/google', () => ({ google: () => 'model' }));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mock.allowance,
}));
vi.mock('@tuturuuu/ai/studio/metering', () => ({
  beginAiStudioRun: mock.begin,
  settleAiStudioRun: mock.settle,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        single: async () => ({
          data:
            table === 'workspaces'
              ? { id: 'personal', deleted: false }
              : { markup_multiplier: mock.markup },
          error: null,
        }),
      };
      return q;
    },
  }),
}));
vi.mock('ai', () => ({
  generateText: mock.generate,
  Output: { object: (input: unknown) => input },
}));

import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { generateBilledNotesVoice } from './provider';

const actor = { userId: 'actor', wsId: 'team', jobId: 'job', attempt: 1 };
const usage = {
  promptTokenCount: 10,
  candidatesTokenCount: 3,
  promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 10 }],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-only-provider');
  mock.markup = 2;
  mock.allowance.mockResolvedValue({
    allowed: true,
    tier: 'FREE',
    maxOutputTokens: 100,
  });
  mock.begin.mockResolvedValue({ runId: 'run' });
  mock.settle.mockResolvedValue(undefined);
  mock.generate.mockResolvedValue({
    text: 'Transcript',
    providerMetadata: { google: { usageMetadata: usage } },
  });
});
describe('Notes voice metering boundary', () => {
  it('reserves personal credits before generation and only settles measured usage', async () => {
    expect(
      (
        await generateBilledNotesVoice(
          { audio: new Uint8Array(2), mediaType: 'audio/wav' },
          actor
        )
      ).transcript
    ).toBe('Transcript');
    expect(mock.allowance).toHaveBeenCalledWith(
      'personal',
      expect.any(String),
      'generate',
      { userId: 'actor' }
    );
    expect(mock.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'personal',
        actorId: 'actor',
        rejectExisting: true,
        idempotencyKey: 'notes-voice:job:1:transcription',
      })
    );
    expect(mock.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run',
        status: 'succeeded',
        providerCostUsd: expect.any(Number),
      })
    );
    expect(JSON.stringify(mock.begin.mock.calls)).not.toContain('Transcript');
    expect(mock.generate.mock.calls[0]?.[0].maxRetries).toBe(0);
  });
  it('does not call provider without credits', async () => {
    mock.allowance.mockResolvedValue({ allowed: false });
    await expect(
      generateBilledNotesVoice(
        { audio: new Uint8Array(2), mediaType: 'audio/wav' },
        actor
      )
    ).rejects.toMatchObject({ code: 'credits_unavailable' });
    expect(mock.generate).not.toHaveBeenCalled();
    expect(mock.begin).not.toHaveBeenCalled();
  });
  it('translates a reservation rejection before the provider into a safe failed preflight', async () => {
    mock.begin.mockRejectedValue(
      new AiStudioError('no credits', {
        code: 'insufficient_credits',
        status: 402,
      })
    );
    await expect(
      generateBilledNotesVoice(
        { audio: new Uint8Array(2), mediaType: 'audio/wav' },
        actor
      )
    ).rejects.toMatchObject({ code: 'credits_unavailable' });
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it('does not fabricate a charge or refund after uncertain provider failure', async () => {
    mock.generate.mockRejectedValue(new TypeError('network interrupted'));
    await expect(
      generateBilledNotesVoice(
        { audio: new Uint8Array(2), mediaType: 'audio/wav' },
        actor
      )
    ).rejects.toThrow();
    expect(mock.settle).not.toHaveBeenCalled();
    expect(mock.generate).toHaveBeenCalledTimes(1);
  });
  it('withholds unmetered output for review', async () => {
    mock.generate.mockResolvedValue({
      text: 'unmetered',
      providerMetadata: {},
    });
    await expect(
      generateBilledNotesVoice(
        { audio: new Uint8Array(2), mediaType: 'audio/wav' },
        actor
      )
    ).rejects.toMatchObject({ code: 'usage_review_required' });
    expect(mock.settle).not.toHaveBeenCalled();
  });
  it('keeps transcript out of billing metadata and produces review-only structured proposals', async () => {
    const artifact = {
      title: 'Title',
      summary: 'Summary',
      decisions: [],
      actionItems: [],
      recommendations: [
        {
          suggestion: 'Review the plan',
          evidence: 'We should review the plan',
        },
      ],
      openQuestions: [],
    };
    mock.generate.mockResolvedValue({
      output: artifact,
      text: '',
      providerMetadata: { google: { usageMetadata: usage } },
    });
    expect(
      (
        await generateBilledNotesVoice(
          {
            transcript: 'Private fixture discussion',
            timezone: 'UTC',
            recordedAt: '2026-10-06T00:00:00Z',
          },
          actor
        )
      ).artifact
    ).toEqual(artifact);
    expect(mock.begin.mock.calls[0]?.[0].idempotencyKey).toBe(
      'notes-voice:job:1:notes'
    );
    expect(JSON.stringify(mock.begin.mock.calls)).not.toContain(
      'Private fixture discussion'
    );
    expect(mock.generate.mock.calls[0]?.[0].system).toContain(
      'Do not perform actions'
    );
  });
});
