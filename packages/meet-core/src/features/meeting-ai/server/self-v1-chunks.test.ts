import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeMeetWav } from '../audio';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  loadSession: vi.fn(),
  authorize: vi.fn(),
  ack: vi.fn(),
  limiter: vi.fn(),
  payer: vi.fn(),
  credits: vi.fn(),
  generate: vi.fn(),
  flag: vi.fn(),
  rpc: {
    reserveChunk: vi.fn(),
    markDispatch: vi.fn(),
    settleChunk: vi.fn(),
    consentState: vi.fn(),
    recordDecision: vi.fn(),
    closeStream: vi.fn(),
    revokeUpload: vi.fn(),
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('./self-v1-access', () => ({
  meetSelfAccess: mocks.access,
  loadSelfSession: mocks.loadSession,
}));
vi.mock('./self-v1-room', () => ({
  selfRoom: async () => ({ access: {}, accountId: uploader }),
  selfRoomCommands: { authorize: mocks.authorize, ack: mocks.ack },
}));
vi.mock('./self-v1-rpc', async (original) => ({
  ...(await original<object>()),
  selfRpc: mocks.rpc,
}));
vi.mock('./usage-limit', () => ({ enforceMeetAiUsage: mocks.limiter }));
vi.mock('./transcript-authority', () => ({
  requireMeetTranscriptPayer: mocks.payer,
}));
vi.mock('./credit-admission', () => ({ admitMeetCredits: mocks.credits }));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
}));
vi.mock('./per-speaker-flag', () => ({ meetPerSpeakerEnabled: mocks.flag }));

import { MeetAiError, meetAiResponse } from './access';
import { transcribeSelfChunk } from './self-v1-chunks';
import { MeetSelfRpcError } from './self-v1-rpc';

const ws = '00000000-0000-4000-8000-0000000000ee';
const meetingId = '00000000-0000-4000-8000-0000000000dd';
const sessionId = '00000000-0000-4000-8000-0000000000cc';
const streamId = '00000000-0000-4000-8000-0000000000bb';
const chunkId = '00000000-0000-4000-8000-000000000001';
const host = '00000000-0000-4000-8000-0000000000a1';
const uploader = '00000000-0000-4000-8000-0000000000a2';
const params = { params: Promise.resolve({ wsId: ws, meetingId }) };
const request = () =>
  new Request('https://meet.tuturuuu.com/api/meet-ai/x/y/chunks', {
    method: 'POST',
    headers: { origin: 'https://meet.tuturuuu.com' },
  });
function form(seconds = 2) {
  const body = new FormData();
  body.set('sessionId', sessionId);
  body.set('streamId', streamId);
  body.set('id', chunkId);
  body.set('sequence', '3');
  body.set('startSample', '32000');
  body.set('consentRevision', '2');
  body.set('audio', encodeMeetWav(new Float32Array(16000 * seconds)), 'a.wav');
  return body;
}
const reserved = {
  id: chunkId,
  session_id: sessionId,
  stream_id: streamId,
  sequence: 3,
  start_ms: 2000,
  end_ms: 4000,
  status: 'processing',
  reservation_state: 'reserved',
  dispatch_consent_revision: null,
  transcript: null,
};
const run = (body = form()) =>
  meetAiResponse(() => transcribeSelfChunk(request(), params, body));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({
    db: {},
    user: { id: uploader },
    wsId: ws,
    meetingId,
    isHost: false,
  });
  mocks.loadSession.mockResolvedValue({
    id: sessionId,
    user_id: host,
    billing_host_id: host,
    billing_ws_id: ws,
    generation: 1,
    language_hint: null,
  });
  mocks.authorize.mockResolvedValue({ allowed: true, pending: [] });
  mocks.payer.mockResolvedValue({ billingWorkspaceId: 'root-ws' });
  mocks.credits.mockResolvedValue({ workspaceId: 'root-ws' });
  mocks.flag.mockResolvedValue(true);
  mocks.rpc.reserveChunk.mockResolvedValue(reserved);
  mocks.rpc.markDispatch.mockResolvedValue({ ...reserved });
  mocks.rpc.consentState.mockResolvedValue({ decision: 'allow', revision: 2 });
  mocks.rpc.settleChunk.mockImplementation(async (_db, input) => ({
    ...reserved,
    status:
      input.outcome === 'completed'
        ? 'completed'
        : input.outcome === 'discarded'
          ? 'discarded'
          : 'failed',
    transcript: input.transcript ?? null,
  }));
  mocks.generate.mockImplementation(async (_input, _actor, _adm, hooks) => {
    await hooks?.beforeProvider?.();
    return {
      text: 'my own words',
      costUsd: 0.001,
      usage: { model: 'm', available: true, inputTokens: 1, outputTokens: 2 },
    };
  });
});

const noWork = () => {
  expect(mocks.limiter).not.toHaveBeenCalled();
  expect(mocks.credits).not.toHaveBeenCalled();
  expect(mocks.rpc.reserveChunk).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
};

describe('self_v1 chunk admission', () => {
  it('stores the uploader text under the host pair', async () => {
    const response = await run();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'completed',
      transcript: 'my own words',
    });
    // Billing starts from the session host pair, never the uploader.
    expect(mocks.payer).toHaveBeenCalledWith({
      userId: host,
      wsId: ws,
      meetingId,
    });
    expect(mocks.credits).toHaveBeenCalledWith(host, meetingId, 'root-ws');
    expect(mocks.generate.mock.calls[0]?.[1]).toMatchObject({ userId: host });
    expect(mocks.rpc.reserveChunk).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        accountId: uploader,
        streamId,
        consentRevision: 2,
        startMs: 2000,
        endMs: 4000,
        audioSeconds: 2,
      })
    );
    expect(mocks.authorize).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ spend: true })
    );
    expect(mocks.authorize).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ spend: false })
    );
    expect(mocks.rpc.settleChunk).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ outcome: 'completed', costUsd: 0.001 })
    );
  });

  it('refuses at the room before any limiter, credit, row or provider work', async () => {
    mocks.authorize.mockResolvedValue({ allowed: false, pending: [] });
    const response = await run();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'MEET_TRANSCRIPT_CONSENT_REQUIRED',
    });
    noWork();
  });

  it('writes pending legal entries even for a refused admission', async () => {
    mocks.authorize.mockResolvedValue({
      allowed: false,
      pending: [
        { sessionId, accountId: uploader, seq: 4, kind: 'withdraw' },
      ],
    });
    mocks.rpc.recordDecision.mockResolvedValue({ revision: 3, recorded: true });
    expect((await run()).status).toBe(409);
    expect(mocks.rpc.recordDecision).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ decision: 'withdraw', roomSeq: 4 })
    );
    expect(mocks.ack).toHaveBeenCalledWith(expect.anything(), sessionId, [
      { accountId: uploader, seq: 4 },
    ]);
    noWork();
  });

  it('refuses an empty token bucket with 429 before the limiter', async () => {
    mocks.authorize.mockResolvedValue({
      allowed: false,
      reason: 'rate_limited',
      pending: [],
    });
    expect((await run()).status).toBe(429);
    noWork();
  });

  it('charges the limiter at least five seconds and stops on refusal', async () => {
    mocks.limiter.mockRejectedValue(new MeetAiError(429, 'limit'));
    expect((await run(form(1))).status).toBe(429);
    expect(mocks.limiter).toHaveBeenCalledWith(
      expect.objectContaining({ userId: uploader, audioSeconds: 5 })
    );
    expect(mocks.payer).not.toHaveBeenCalled();
    expect(mocks.rpc.reserveChunk).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('stops when the host loses payer authority', async () => {
    mocks.payer.mockRejectedValue(new MeetAiError(403, 'no payer'));
    expect((await run()).status).toBe(403);
    expect(mocks.rpc.reserveChunk).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('refuses at the cost or per-account cap without a provider call', async () => {
    mocks.rpc.reserveChunk.mockRejectedValue(
      new MeetSelfRpcError(409, 'cap', '54000')
    );
    expect((await run()).status).toBe(409);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('returns a settled exact duplicate without dispatching again', async () => {
    mocks.rpc.reserveChunk.mockResolvedValue({
      ...reserved,
      status: 'completed',
      reservation_state: 'settled',
      dispatch_consent_revision: 2,
      transcript: 'saved',
    });
    expect(await (await run()).json()).toMatchObject({ transcript: 'saved' });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});

describe('self_v1 in-flight fence', () => {
  it('fails a chunk withdrawn before dispatch without a provider call', async () => {
    let providerCalled = false;
    mocks.rpc.markDispatch.mockRejectedValue(
      new MeetSelfRpcError(409, 'withdrawn', '55000')
    );
    mocks.generate.mockImplementation(async (_i, _a, _adm, hooks) => {
      await hooks.beforeProvider();
      providerCalled = true;
    });
    expect((await run()).status).toBe(409);
    expect(providerCalled).toBe(false);
    expect(mocks.rpc.settleChunk).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ outcome: 'released' })
    );
  });

  it('settles a dispatch-marked chunk at zero when the room recheck refuses', async () => {
    let providerCalled = false;
    mocks.authorize
      .mockResolvedValueOnce({ allowed: true, pending: [] })
      .mockResolvedValueOnce({ allowed: false, pending: [] });
    mocks.generate.mockImplementation(async (_i, _a, _adm, hooks) => {
      await hooks.beforeProvider();
      providerCalled = true;
    });
    expect((await run()).status).toBe(409);
    expect(providerCalled).toBe(false);
    expect(mocks.rpc.settleChunk).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ outcome: 'discarded', costUsd: 0 })
    );
  });

  it('starts no provider call when the flag turns off before dispatch', async () => {
    mocks.flag.mockResolvedValue(false);
    let providerCalled = false;
    mocks.generate.mockImplementation(async (_i, _a, _adm, hooks) => {
      await hooks.beforeProvider();
      providerCalled = true;
    });
    expect((await run()).status).toBe(403);
    expect(providerCalled).toBe(false);
    expect(mocks.rpc.markDispatch).not.toHaveBeenCalled();
  });

  it('counts a provider error after dispatch as unknown cost', async () => {
    mocks.generate.mockImplementation(async (_i, _a, _adm, hooks) => {
      await hooks.beforeProvider();
      throw new MeetAiError(502, 'provider failed');
    });
    expect((await run()).status).toBe(502);
    expect(mocks.rpc.settleChunk).toHaveBeenCalledWith(
      {},
      { chunkId, outcome: 'unknown' }
    );
  });

  it.each([
    [
      'the room ends the speaker during the provider call',
      () =>
        mocks.authorize
          .mockResolvedValueOnce({ allowed: true, pending: [] })
          .mockResolvedValueOnce({ allowed: true, pending: [] })
          .mockResolvedValueOnce({ allowed: false, pending: [] }),
    ],
    [
      'the legal record moved to withdraw',
      () =>
        mocks.rpc.consentState.mockResolvedValue({
          decision: 'withdraw',
          revision: 3,
        }),
    ],
    [
      'the legal record moved to a newer allow revision',
      () =>
        mocks.rpc.consentState.mockResolvedValue({
          decision: 'allow',
          revision: 4,
        }),
    ],
  ])('discards the text when %s', async (_label, arrange) => {
    arrange();
    const response = await run();
    const body = await response.json();
    expect(body).toMatchObject({ status: 'discarded', transcript: null });
    const settle = mocks.rpc.settleChunk.mock.calls[0]?.[1];
    expect(settle).toMatchObject({ outcome: 'discarded', costUsd: 0.001 });
    expect(settle.transcript).toBeUndefined();
    expect(JSON.stringify(settle.usage)).not.toContain('my own words');
  });

  it('discards when the database refuses completed text', async () => {
    mocks.rpc.settleChunk.mockImplementation(async (_db, input) => {
      if (input.outcome === 'completed')
        throw new MeetSelfRpcError(409, 'stale', '55000');
      return { ...reserved, status: 'discarded' };
    });
    expect(await (await run()).json()).toMatchObject({
      status: 'discarded',
      transcript: null,
    });
  });
});
