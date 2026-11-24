import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  loadSession: vi.fn(),
  begin: vi.fn(),
  commit: vi.fn(),
  ack: vi.fn(),
  rpc: {
    consentState: vi.fn(),
    recordDecision: vi.fn(),
    openStream: vi.fn(),
    renewStream: vi.fn(),
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
  selfRoom: async () => ({ access: {}, accountId: 'u' }),
  selfRoomCommands: {
    openBegin: mocks.begin,
    openCommit: mocks.commit,
    ack: mocks.ack,
  },
}));
vi.mock('./self-v1-rpc', async (original) => ({
  ...(await original<object>()),
  selfRpc: mocks.rpc,
}));

import { meetAiResponse } from './access';
import { MeetSelfRpcError } from './self-v1-rpc';
import { openSelfStream, renewSelfStream } from './self-v1-stream';

const sessionId = '00000000-0000-4000-8000-0000000000cc';
const streamId = '00000000-0000-4000-8000-0000000000bb';
const uploader = '00000000-0000-4000-8000-0000000000a2';
const params = { params: Promise.resolve({ wsId: 'w', meetingId: 'm' }) };
const post = (body: unknown) =>
  new Request('https://meet.tuturuuu.com/api/meet-ai/w/m/self/open', {
    method: 'POST',
    headers: { origin: 'https://meet.tuturuuu.com' },
    body: JSON.stringify(body),
  });

describe('self_v1 stream open', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({
      db: {},
      user: { id: uploader },
      wsId: 'w',
      meetingId: 'm',
    });
    mocks.loadSession.mockResolvedValue({ id: sessionId, generation: 4 });
    mocks.begin.mockResolvedValue({ epoch: 9, allowSeq: 12, pending: [] });
    mocks.rpc.consentState.mockResolvedValue({
      decision: 'withdraw',
      revision: 2,
    });
    mocks.rpc.recordDecision.mockResolvedValue({ revision: 3, recorded: true });
    mocks.rpc.openStream.mockResolvedValue({
      stream_id: streamId,
      lease_expires_at: '2026-11-24T00:01:00Z',
    });
    mocks.commit.mockResolvedValue({ committed: true, pending: [] });
  });

  it('drains, appends a fresh allow after a withdraw, opens and commits', async () => {
    mocks.begin.mockResolvedValue({
      epoch: 9,
      allowSeq: 12,
      pending: [{ sessionId, accountId: uploader, seq: 11, kind: 'withdraw' }],
    });
    const response = await meetAiResponse(() =>
      openSelfStream(post({ sessionId }), params)
    );
    expect(await response.json()).toEqual({
      streamId,
      consentRevision: 3,
      leaseExpiresAt: '2026-11-24T00:01:00Z',
    });
    const decisions = mocks.rpc.recordDecision.mock.calls.map((call) => [
      call[1].decision,
      call[1].roomSeq,
    ]);
    expect(decisions).toEqual([
      ['withdraw', 11],
      ['allow', 12],
    ]);
    expect(mocks.rpc.openStream).toHaveBeenCalledWith(
      {},
      { sessionId, accountId: uploader, generation: 4, consentRevision: 3 }
    );
    expect(mocks.commit).toHaveBeenCalledWith(expect.anything(), {
      sessionId,
      epoch: 9,
      revision: 3,
      streamId,
    });
  });

  it('reuses a current allow instead of appending another', async () => {
    mocks.rpc.consentState.mockResolvedValue({
      decision: 'allow',
      revision: 5,
    });
    await openSelfStream(post({ sessionId }), params);
    expect(mocks.rpc.recordDecision).not.toHaveBeenCalled();
    expect(mocks.rpc.openStream.mock.calls[0]?.[1]).toMatchObject({
      consentRevision: 5,
    });
  });

  it('closes the new stream when an ending lands between begin and commit', async () => {
    mocks.commit.mockResolvedValue({
      committed: false,
      pending: [{ sessionId, accountId: uploader, seq: 13, kind: 'withdraw' }],
    });
    const response = await meetAiResponse(() =>
      openSelfStream(post({ sessionId }), params)
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'MEET_SELF_NOT_ELIGIBLE',
    });
    expect(mocks.rpc.recordDecision).toHaveBeenLastCalledWith(
      {},
      expect.objectContaining({ decision: 'withdraw', roomSeq: 13 })
    );
  });

  it('maps a database refusal to not eligible', async () => {
    mocks.rpc.openStream.mockRejectedValue(
      new MeetSelfRpcError(409, 'revoked', '55000')
    );
    const response = await meetAiResponse(() =>
      openSelfStream(post({ sessionId }), params)
    );
    expect(response.status).toBe(409);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('refuses unknown fields', async () => {
    const response = await meetAiResponse(() =>
      openSelfStream(post({ sessionId, accountId: uploader }), params)
    );
    expect(response.status).toBe(400);
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it('renews only the caller own stream', async () => {
    mocks.rpc.renewStream.mockResolvedValue('2026-11-24T00:02:00Z');
    expect(
      await renewSelfStream(post({ sessionId, streamId }), params)
    ).toEqual({ leaseExpiresAt: '2026-11-24T00:02:00Z' });
    expect(mocks.rpc.renewStream).toHaveBeenCalledWith(
      {},
      { streamId, accountId: uploader }
    );
  });
});
