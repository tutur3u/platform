import { beforeEach, expect, it, vi } from 'vitest';
import { encodeMeetWav } from '../audio';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  check: vi.fn(),
  generate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
// Authorization is covered separately; avoid loading built auth packages here.
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.check,
}));
vi.mock('../../call/server/room-service', () => ({
  personalWorkspace: async () => 'personal-workspace',
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

import { meetAiResponse } from './access';
import { transcribeMeetChunk } from './chunks';

const id = '00000000-0000-4000-8000-000000000001';
const params = { params: Promise.resolve({ wsId: id, meetingId: id }) };
function query(result: unknown) {
  const value = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  value.select.mockReturnValue(value);
  value.update.mockReturnValue(value);
  value.eq.mockReturnValue(value);
  return value;
}
function request() {
  const body = new FormData();
  body.set('id', id);
  body.set('sessionId', id);
  body.set('sequence', '0');
  body.set('startSeconds', '1');
  body.set('speakerAccountId', id);
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

it('refuses an unbillable upload before reserving a transcript row', async () => {
  const { from, rpc } = storage();
  mocks.check.mockResolvedValue({
    allowed: false,
    errorCode: 'DAILY_LIMIT_REACHED',
  });
  const response = await meetAiResponse(() =>
    transcribeMeetChunk(request(), params)
  );
  expect(response.status).toBe(402);
  expect(await response.json()).toMatchObject({
    code: 'MEET_AI_CREDITS_DAILY_LIMIT',
  });
  // No reservation means no failed "[Missing audio segment]" row.
  expect(rpc).not.toHaveBeenCalled();
  expect(from).toHaveBeenCalledTimes(2);
  expect(mocks.generate).not.toHaveBeenCalled();
});

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
  expect(await transcribeMeetChunk(request(), params)).toEqual(saved);
  expect(mocks.check).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(mocks.generate).toHaveBeenCalledWith(
    { audio: expect.any(Uint8Array), hints: expect.anything() },
    expect.objectContaining({ userId: id, attemptId: id }),
    { workspaceId: 'personal-workspace', allowance }
  );
});
