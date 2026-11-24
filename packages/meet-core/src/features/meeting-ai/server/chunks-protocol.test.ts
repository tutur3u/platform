import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeMeetWav } from '../audio';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  self: vi.fn(),
  generate: vi.fn(),
  fence: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('./self-v1-chunks', () => ({ transcribeSelfChunk: mocks.self }));
vi.mock('./transcript-fence', () => ({
  requireMeetTranscriptFence: mocks.fence,
  recordMeetTranscriptSession: async () => {},
}));
vi.mock('./transcript-speaker', () => ({
  resolveTranscriptSpeaker: async () => null,
}));
vi.mock('./usage-limit', () => ({ enforceMeetAiUsage: async () => {} }));
vi.mock('./transcript-authority', () => ({
  requireMeetTranscriptPayer: async () => ({ billingWorkspaceId: 'w' }),
}));
vi.mock('./credit-admission', () => ({ admitMeetCredits: async () => ({}) }));
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
function chain(result: unknown) {
  const value: Record<string, unknown> = {};
  for (const key of ['select', 'eq', 'update']) value[key] = vi.fn(() => value);
  value.maybeSingle = vi.fn().mockResolvedValue(result);
  return value;
}
function legacyForm() {
  const body = new FormData();
  body.set('id', id);
  body.set('sessionId', id);
  body.set('sequence', '0');
  body.set('startSeconds', '0');
  body.set('speakerAccountId', id);
  body.set('sourceKind', 'microphone');
  body.set('audio', encodeMeetWav(new Float32Array(16000)), 'a.wav');
  return body;
}
const post = (body: FormData, headers: Record<string, string> = {}) =>
  new Request('https://meet.tuturuuu.com/api/meet-ai/x/y/chunks', {
    method: 'POST',
    headers: { origin: 'https://meet.tuturuuu.com', ...headers },
    body,
  });

describe('chunk upload protocol branch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.self.mockResolvedValue({ status: 'completed' });
  });

  it('sends a stream-bound upload to the per-speaker path, not host access', async () => {
    const body = new FormData();
    body.set('streamId', id);
    body.set('audio', encodeMeetWav(new Float32Array(16000)), 'a.wav');
    expect(await transcribeMeetChunk(post(body), params)).toEqual({
      status: 'completed',
    });
    expect(mocks.self).toHaveBeenCalledOnce();
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it('refuses a per-speaker request over 350 KB', async () => {
    const body = new FormData();
    body.set('streamId', id);
    body.set('audio', new Blob([new Uint8Array(360_000)]), 'a.wav');
    const response = await meetAiResponse(() =>
      transcribeMeetChunk(post(body), params)
    );
    expect(response.status).toBe(413);
    expect(mocks.self).not.toHaveBeenCalled();
  });

  it('keeps batches on the host-only room path', async () => {
    mocks.access.mockRejectedValue(
      Object.assign(new Error('host only'), { status: 403 })
    );
    const body = legacyForm();
    body.set('streamId', id);
    await meetAiResponse(() =>
      transcribeMeetChunk(post(body, { 'x-meet-audio-batch': '1' }), params)
    );
    expect(mocks.access).toHaveBeenCalledOnce();
    expect(mocks.self).not.toHaveBeenCalled();
  });

  it('refuses room-mix audio for a per-speaker session before any work', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chain({
          data: {
            id,
            protocol: 'self_v1',
            created_at: new Date().toISOString(),
            ended_at: null,
          },
          error: null,
        })
      );
    mocks.access.mockResolvedValue({
      db: { from, rpc: vi.fn() },
      meetingId: id,
      wsId: id,
      user: { id },
      canManage: true,
    });
    const response = await meetAiResponse(() =>
      transcribeMeetChunk(post(legacyForm()), params)
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'MEET_SELF_PROTOCOL_MISMATCH',
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect(mocks.fence).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
