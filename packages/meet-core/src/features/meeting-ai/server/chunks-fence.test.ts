import { beforeEach, expect, it, vi } from 'vitest';
import { encodeMeetWav } from '../audio';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  credits: vi.fn(),
  enforce: vi.fn(),
  fence: vi.fn(),
  generate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
// Entitlement and payer are covered by transcript-authority tests.
vi.mock('./transcript-authority', () => ({
  requireMeetTranscriptPayer: async () => ({
    payer: 'account',
    billingWorkspaceId: '00000000-0000-4000-8000-0000000000bb',
  }),
}));
vi.mock('./transcript-fence', () => ({
  requireMeetTranscriptFence: mocks.fence,
  recordMeetTranscriptSession: async () => {},
}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('./credit-admission', () => ({ admitMeetCredits: mocks.credits }));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
}));
vi.mock('./transcript-speaker', () => ({
  resolveTranscriptSpeaker: async () => null,
}));
vi.mock('./usage-limit', () => ({ enforceMeetAiUsage: mocks.enforce }));
vi.mock('./access', async (original) => ({
  ...(await original<object>()),
  meetAiAccess: mocks.access,
}));

import { MeetAiError, meetAiResponse } from './access';
import { transcribeMeetChunk } from './chunks';

const id = '00000000-0000-4000-8000-000000000001';
const host = '00000000-0000-4000-8000-0000000000aa';
const guest = '00000000-0000-4000-8000-0000000000cc';
const params = { params: Promise.resolve({ wsId: id, meetingId: id }) };

function chain(result: unknown) {
  const value: Record<string, unknown> = {};
  for (const key of ['select', 'update', 'eq', 'in', 'order', 'range'])
    value[key] = vi.fn(() => value);
  value.maybeSingle = vi.fn().mockResolvedValue(result);
  return value;
}

function setup() {
  const from = vi.fn();
  from.mockReturnValueOnce(
    chain({
      data: { id, created_at: new Date().toISOString(), ended_at: null },
      error: null,
    })
  );
  from.mockReturnValueOnce(chain({ data: null, error: null }));
  const rpc = vi.fn();
  mocks.access.mockResolvedValue({
    db: { from, rpc },
    meetingId: id,
    wsId: id,
    user: { id: host },
    canManage: true,
  });
  return { rpc };
}

function batchRequest() {
  const body = new FormData();
  body.set('id', id);
  body.set('sessionId', id);
  body.set('sequence', '0');
  body.set('startSeconds', '0');
  const wav = encodeMeetWav(new Float32Array(16000 * 2));
  body.set('audio_0', wav, 'source-0.wav');
  body.set('audio_1', wav, 'source-1.wav');
  body.set(
    'sources',
    JSON.stringify([
      { speakerAccountId: host, sourceKind: 'microphone', startSeconds: 0 },
      { speakerAccountId: guest, sourceKind: 'microphone', startSeconds: 0 },
    ])
  );
  return new Request('https://meet.tuturuuu.com/api/meet-ai/test', {
    method: 'POST',
    body,
    headers: { 'X-Meet-Audio-Batch': '1' },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-only');
});

it('refuses a chunk without everyone’s Allow before any limiter, credit, row or provider work', async () => {
  const { rpc } = setup();
  mocks.fence.mockRejectedValue(
    new MeetAiError(409, 'consent', 'MEET_TRANSCRIPT_CONSENT_REQUIRED')
  );
  const response = await meetAiResponse(() =>
    transcribeMeetChunk(batchRequest(), params)
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    code: 'MEET_TRANSCRIPT_CONSENT_REQUIRED',
  });
  expect(mocks.fence).toHaveBeenCalledWith({
    meetingId: id,
    actorId: host,
    sessionId: id,
    sourceAccountIds: [host, guest],
  });
  expect(mocks.enforce).not.toHaveBeenCalled();
  expect(mocks.credits).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});

it('checks the fence before the limiter on an allowed chunk', async () => {
  setup();
  const order: string[] = [];
  mocks.fence.mockImplementation(async () => void order.push('fence'));
  mocks.enforce.mockImplementation(async () => {
    order.push('limit');
    throw new MeetAiError(429, 'limited');
  });
  await meetAiResponse(() => transcribeMeetChunk(batchRequest(), params));
  expect(order).toEqual(['fence', 'limit']);
});
