import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  admin: vi.fn(),
  rpc: {
    recordDecision: vi.fn(),
    closeStream: vi.fn(),
    revokeUpload: vi.fn(),
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/realtime/meet/service-credential', () => ({
  verifyMeetSelfOutboxCredential: mocks.verify,
}));
vi.mock('../../call/lib/call-session', () => ({
  getMeetRealtimeTokenSecret: () => 'secret',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('./self-v1-rpc', async (original) => ({
  ...(await original<object>()),
  selfRpc: mocks.rpc,
}));
vi.mock('./self-v1-room', () => ({ selfRoomCommands: { ack: vi.fn() } }));

import { POST } from '../../../routes/api/meet-ai/self/outbox/route';
import { MEET_SELF_OUTBOX_MAX_BYTES } from './self-v1-outbox-delivery';
import { MeetSelfRpcError } from './self-v1-rpc';

const ws = '00000000-0000-4000-8000-0000000000ee';
const meetingId = '00000000-0000-4000-8000-0000000000dd';
const sessionId = '00000000-0000-4000-8000-0000000000cc';
const otherSession = '00000000-0000-4000-8000-0000000000cb';
const a = '00000000-0000-4000-8000-0000000000a1';
const b = '00000000-0000-4000-8000-0000000000a2';
const roomId = `${ws}:${meetingId}`;
const claims = {
  aud: 'meet-service',
  purpose: 'self-outbox',
  roomId,
  exp: Math.floor(Date.now() / 1000) + 60,
};
const entry = (
  accountId: string,
  seq: number,
  kind: 'withdraw' | 'revoke' | 'close',
  session = sessionId
) => ({ sessionId: session, accountId, seq, kind });

function deliver(
  body: unknown,
  headers: Record<string, string> = { authorization: 'Bearer signed' }
) {
  return POST(
    new Request('https://meet.internal/api/meet-ai/self/outbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}
const query = {
  select: vi.fn(() => query),
  in: vi.fn(() => query),
  eq: vi.fn(() => query),
  then: (resolve: (value: unknown) => void) =>
    resolve({ data: [{ id: sessionId }], error: null }),
};

beforeEach(() => {
  vi.resetAllMocks();
  query.select.mockImplementation(() => query);
  query.in.mockImplementation(() => query);
  query.eq.mockImplementation(() => query);
  mocks.verify.mockReturnValue(claims);
  mocks.admin.mockResolvedValue({ from: () => query });
  mocks.rpc.recordDecision.mockResolvedValue({ revision: 2, recorded: true });
  mocks.rpc.closeStream.mockResolvedValue(true);
  mocks.rpc.revokeUpload.mockResolvedValue(true);
});

const noWrites = () => {
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.rpc.recordDecision).not.toHaveBeenCalled();
  expect(mocks.rpc.closeStream).not.toHaveBeenCalled();
};

describe('self_v1 outbox delivery credential', () => {
  it('refuses a request with no credential, even with a session cookie', async () => {
    const response = await deliver(
      { roomId, meetingId, entries: [entry(a, 1, 'withdraw')] },
      { cookie: 'sb-access-token=user' }
    );
    expect(response.status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled();
    noWrites();
  });

  it('refuses a credential that does not verify', async () => {
    mocks.verify.mockReturnValue(null);
    const response = await deliver({ roomId, meetingId, entries: [] });
    expect(response.status).toBe(401);
    expect(mocks.verify).toHaveBeenCalledWith('signed', 'secret');
    noWrites();
  });

  it('refuses a verifier that throws', async () => {
    mocks.verify.mockImplementation(() => {
      throw new Error('bad signature');
    });
    expect((await deliver({ roomId, meetingId, entries: [] })).status).toBe(
      401
    );
  });

  it.each([
    ['another purpose', { ...claims, purpose: 'attendance-ledger' }],
    ['another audience', { ...claims, aud: 'meet' }],
    ['an expired credential', { ...claims, exp: 1 }],
  ])('refuses %s', async (_label, value) => {
    mocks.verify.mockReturnValue(value);
    const response = await deliver({
      roomId,
      meetingId,
      entries: [entry(a, 1, 'withdraw')],
    });
    expect(response.status).toBe(401);
    noWrites();
  });

  it('refuses a body for another room than the credential names', async () => {
    const otherRoom = `${ws}:${otherSession}`;
    const response = await deliver({
      roomId: otherRoom,
      meetingId: otherSession,
      entries: [entry(a, 1, 'withdraw')],
    });
    expect(response.status).toBe(403);
    noWrites();
  });

  it('refuses a meeting id that differs from the room id', async () => {
    const response = await deliver({
      roomId,
      meetingId: otherSession,
      entries: [entry(a, 1, 'withdraw')],
    });
    expect(response.status).toBe(403);
    noWrites();
  });
});

describe('self_v1 outbox delivery body', () => {
  it('refuses a declared oversize body before reading it', async () => {
    const response = await deliver(
      { roomId, meetingId, entries: [] },
      {
        authorization: 'Bearer signed',
        'content-length': String(MEET_SELF_OUTBOX_MAX_BYTES + 1),
      }
    );
    expect(response.status).toBe(413);
    noWrites();
  });

  it('refuses an oversize body without a declared length', async () => {
    const padded = JSON.stringify({
      roomId,
      meetingId,
      entries: [],
      pad: 'x'.repeat(MEET_SELF_OUTBOX_MAX_BYTES),
    });
    expect((await deliver(padded)).status).toBe(413);
    noWrites();
  });

  it('refuses more than 64 entries', async () => {
    const entries = Array.from({ length: 65 }, (_, index) =>
      entry(a, index + 1, 'close')
    );
    expect((await deliver({ roomId, meetingId, entries })).status).toBe(400);
    noWrites();
  });

  it('refuses entries outside the documented shape', async () => {
    for (const entries of [
      [{ ...entry(a, 1, 'withdraw'), transcript: 'x' }],
      [{ ...entry(a, 1, 'withdraw'), kind: 'allow' }],
      [{ ...entry(a, 0, 'withdraw') }],
    ])
      expect((await deliver({ roomId, meetingId, entries })).status).toBe(400);
    expect(
      (await deliver({ roomId, meetingId, entries: [], extra: true })).status
    ).toBe(400);
    expect((await deliver('{not json')).status).toBe(400);
    noWrites();
  });
});

describe('self_v1 outbox delivery writes', () => {
  it('writes in order per account and returns what landed', async () => {
    const response = await deliver({
      roomId,
      meetingId,
      entries: [entry(a, 2, 'close'), entry(a, 1, 'withdraw'), entry(b, 1, 'revoke')],
    });
    expect(response.status).toBe(200);
    const { acked } = await response.json();
    expect(acked).toHaveLength(3);
    expect(acked).toEqual(
      expect.arrayContaining([
        { sessionId, accountId: a, seq: 1 },
        { sessionId, accountId: a, seq: 2 },
        { sessionId, accountId: b, seq: 1 },
      ])
    );
    expect(query.eq).toHaveBeenCalledWith('meeting_id', meetingId);
    expect(query.eq).toHaveBeenCalledWith('protocol', 'self_v1');
    expect(mocks.rpc.recordDecision.mock.calls[0]?.[1]).toMatchObject({
      accountId: a,
      decision: 'withdraw',
      roomSeq: 1,
    });
  });

  it('acknowledges a replayed delivery again without new effects', async () => {
    const body = { roomId, meetingId, entries: [entry(a, 1, 'withdraw')] };
    const first = await (await deliver(body)).json();
    // The database treats the same room sequence and kind as a no-op.
    mocks.rpc.recordDecision.mockResolvedValue({ revision: 2, recorded: false });
    const replay = await (await deliver(body)).json();
    expect(replay).toEqual(first);
    expect(replay.acked).toEqual([{ sessionId, accountId: a, seq: 1 }]);
  });

  it('acknowledges a superseded entry', async () => {
    mocks.rpc.closeStream.mockRejectedValue(
      new MeetSelfRpcError(409, 'stale', '40001')
    );
    const { acked } = await (
      await deliver({ roomId, meetingId, entries: [entry(a, 3, 'close')] })
    ).json();
    expect(acked).toEqual([{ sessionId, accountId: a, seq: 3 }]);
  });

  it('never writes entries of another meeting session', async () => {
    const { acked } = await (
      await deliver({
        roomId,
        meetingId,
        entries: [entry(a, 1, 'close', otherSession), entry(b, 1, 'close')],
      })
    ).json();
    expect(acked).toEqual([{ sessionId, accountId: b, seq: 1 }]);
    expect(mocks.rpc.closeStream).toHaveBeenCalledTimes(1);
  });

  it('leaves a failed entry and the account later entries pending', async () => {
    mocks.rpc.recordDecision.mockRejectedValue(
      new MeetSelfRpcError(503, 'down', '')
    );
    const response = await deliver({
      roomId,
      meetingId,
      entries: [entry(a, 1, 'withdraw'), entry(a, 2, 'close'), entry(b, 1, 'close')],
    });
    expect(response.status).toBe(200);
    expect((await response.json()).acked).toEqual([
      { sessionId, accountId: b, seq: 1 },
    ]);
  });

  it('answers 503 when the session lookup fails', async () => {
    const failing: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: null, error: { code: 'x' } }),
    };
    for (const name of ['select', 'in', 'eq']) failing[name] = () => failing;
    mocks.admin.mockResolvedValue({ from: () => failing });
    expect(
      (await deliver({ roomId, meetingId, entries: [entry(a, 1, 'close')] }))
        .status
    ).toBe(503);
  });
});
