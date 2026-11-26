import { beforeEach, expect, it, vi } from 'vitest';
import { encodeMeetWav } from '../audio';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  check: vi.fn(),
  generate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
// A paid host pays from the meeting workspace; see transcript-authority tests.
vi.mock('./transcript-authority', () => ({
  requireMeetTranscriptPayer: async () => ({
    payer: 'account',
    billingWorkspaceId: 'meeting-workspace',
  }),
}));
// The consent fence is covered by transcript-fence and chunks-fence tests.
vi.mock('./transcript-fence', () => ({
  requireMeetTranscriptFence: async () => {},
  recordMeetTranscriptSession: async () => {},
}));
// Limiter behavior is covered by usage-limit and chunks-limit tests.
vi.mock('./usage-limit', () => ({ enforceMeetAiUsage: async () => {} }));
// Authorization is covered separately; avoid loading built auth packages here.
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { ws_id: 'meeting-workspace' },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.check,
}));
vi.mock('./transcript-speaker', () => ({
  resolveTranscriptSpeaker: async () => null,
}));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
}));
vi.mock('./access', async (original) => ({
  ...(await original<object>()),
  meetAiAccess: mocks.access,
}));

import { MeetAiError, meetAiResponse } from './access';
import { transcribeMeetChunk } from './chunks';

const id = '00000000-0000-4000-8000-000000000001';
const params = { params: Promise.resolve({ wsId: id, meetingId: id }) };
function query(result: unknown) {
  const value = {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  value.select.mockReturnValue(value);
  value.update.mockReturnValue(value);
  value.delete.mockReturnValue(value);
  value.eq.mockReturnValue(value);
  return value;
}
function request() {
  const body = new FormData();
  body.set('id', id);
  body.set('sessionId', id);
  body.set('sequence', '0');
  body.set('startSeconds', '1');
  body.set('speakerAccountId', '00000000-0000-4000-8000-0000000000aa');
  body.set('sourceKind', 'microphone');
  body.set('audio', encodeMeetWav(new Float32Array(16000)), 'chunk.wav');
  return new Request('https://meet.tuturuuu.com/api/meet-ai/test', {
    method: 'POST',
    body,
  });
}
function storage(...results: unknown[]) {
  const from = vi.fn();
  for (const result of [
    { data: { id, created_at: new Date().toISOString() }, error: null },
    { data: null, error: null },
    ...results,
  ])
    from.mockReturnValueOnce(query(result));
  const rpc = vi.fn().mockResolvedValue({
    data: { id, attempt_id: id },
    error: null,
  });
  mocks.access.mockResolvedValue({
    db: { from, rpc },
    meetingId: id,
    user: { id },
  });
  return { from, rpc };
}
beforeEach(() => vi.resetAllMocks());

it.each(['DAILY_LIMIT_REACHED', 'CREDITS_EXHAUSTED'])(
  'refuses %s before reserving a transcript row',
  async (errorCode) => {
    const { from, rpc } = storage();
    mocks.check.mockResolvedValue({
      allowed: false,
      errorCode,
    });
    const response = await meetAiResponse(() =>
      transcribeMeetChunk(request(), params)
    );
    expect(response.status).toBe(402);
    const failure = await response.json();
    expect(failure).toMatchObject({
      code:
        errorCode === 'CREDITS_EXHAUSTED'
          ? 'MEET_AI_CREDITS_EXHAUSTED'
          : 'MEET_AI_CREDITS_DAILY_LIMIT',
    });
    if (errorCode === 'CREDITS_EXHAUSTED') {
      expect(failure.error).toBe('The meeting workspace is out of AI credits');
      expect(mocks.check).toHaveBeenCalledWith(
        'meeting-workspace',
        expect.any(String),
        'generate',
        { userId: id }
      );
    }
    // No reservation means no failed "[Missing audio segment]" row.
    expect(rpc).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(2);
    expect(mocks.generate).not.toHaveBeenCalled();
  }
);

it('retries a transient credit check and transcribes with that admission', async () => {
  const saved = { id, status: 'completed', transcript: 'Hello' };
  const { rpc } = storage(
    { data: { ended_at: null }, error: null },
    { data: saved, error: null }
  );
  const allowance = { allowed: true, tier: 'FREE', maxOutputTokens: 2048 };
  mocks.check
    .mockResolvedValueOnce({ allowed: false, errorCode: 'CREDIT_CHECK_FAILED' })
    .mockResolvedValueOnce(allowance);
  mocks.generate.mockResolvedValue({
    text: 'Hello',
    usage: { available: true },
    costUsd: 0.0001,
  });
  expect(await transcribeMeetChunk(request(), params)).toEqual({
    ...saved,
    erased: false,
    segments: [],
    speaker: null,
  });
  expect(mocks.check).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(mocks.generate).toHaveBeenCalledWith(
    { audio: expect.any(Uint8Array), hints: expect.anything() },
    expect.objectContaining({ userId: id, attemptId: id }),
    { workspaceId: 'meeting-workspace', allowance }
  );
});

it('removes the reserved row when the billed run is refused', async () => {
  const { from } = storage({ data: { ended_at: null }, error: null }, null);
  mocks.check.mockResolvedValue({ allowed: true, tier: 'FREE' });
  mocks.generate.mockRejectedValue(
    new MeetAiError(
      402,
      'AI credits unavailable for the meeting workspace',
      'MEET_AI_MODEL_NOT_ON_PLAN'
    )
  );
  const response = await meetAiResponse(() =>
    transcribeMeetChunk(request(), params)
  );
  expect(response.status).toBe(402);
  expect(await response.json()).toMatchObject({
    code: 'MEET_AI_MODEL_NOT_ON_PLAN',
  });
  // No failed row is left to show as "[Missing audio segment]".
  const cleanup = from.mock.results.at(-1)?.value;
  expect(cleanup.delete).toHaveBeenCalledOnce();
  expect(cleanup.update).not.toHaveBeenCalled();
});

it('still marks a provider failure as a failed row', async () => {
  const { from } = storage({ data: { ended_at: null }, error: null }, null);
  mocks.check.mockResolvedValue({ allowed: true, tier: 'FREE' });
  mocks.generate.mockRejectedValue(new MeetAiError(502, 'Provider failed'));
  await meetAiResponse(() => transcribeMeetChunk(request(), params));
  const cleanup = from.mock.results.at(-1)?.value;
  expect(cleanup.update).toHaveBeenCalledWith({ status: 'failed' });
  expect(cleanup.delete).not.toHaveBeenCalled();
});
