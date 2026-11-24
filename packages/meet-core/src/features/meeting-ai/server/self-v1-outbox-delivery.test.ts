import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  admin: vi.fn(),
  rpc: {
    recordDecision: vi.fn(),
    closeStream: vi.fn(),
    revokeUpload: vi.fn(),
    stopSession: vi.fn(),
    closeDrained: vi.fn(),
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
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
import { loadSelfSession } from './self-v1-access';
import { MEET_SELF_OUTBOX_MAX_BYTES } from './self-v1-outbox-delivery';
import { MeetSelfRpcError } from './self-v1-rpc';

const ws = '00000000-0000-4000-8000-0000000000ee';
const meetingId = '00000000-0000-4000-8000-0000000000dd';
const otherMeeting = '00000000-0000-4000-8000-0000000000de';
const sessionId = '00000000-0000-4000-8000-0000000000cc';
const olderSession = '00000000-0000-4000-8000-0000000000ca';
const foreignSession = '00000000-0000-4000-8000-0000000000cb';
const goneSession = '00000000-0000-4000-8000-0000000000c9';
const host = '00000000-0000-4000-8000-0000000000a0';
const a = '00000000-0000-4000-8000-0000000000a1';
const b = '00000000-0000-4000-8000-0000000000a2';
const roomId = `${ws}:${meetingId}`;
const claims = {
  aud: 'meet-service',
  purpose: 'self-outbox',
  roomId,
  exp: Math.floor(Date.now() / 1000) + 60,
};
type Kind = 'withdraw' | 'revoke' | 'close' | 'end';
const entry = (
  accountId: string,
  seq: number,
  kind: Kind,
  session = sessionId
) => ({
  sessionId: session,
  accountId,
  seq,
  kind,
});
const ack = (accountId: string, seq: number, session = sessionId) => ({
  sessionId: session,
  accountId,
  seq,
});

/** A session row the fake database serves and the stop RPC updates. */
const future = () => new Date(Date.now() + 3_600_000).toISOString();
const row = (id: string, meeting = meetingId) => ({
  id,
  meeting_id: meeting,
  protocol: 'self_v1',
  user_id: host,
  billing_host_id: host,
  billing_ws_id: ws,
  capture_state: 'active',
  capture_deadline_at: future(),
  drain_deadline_at: null as string | null,
  ended_at: null as string | null,
});
let sessions: ReturnType<typeof row>[] = [];
let liveStreams = 0;

function fakeDb() {
  const table = (name: string) => {
    const filters: Record<string, unknown> = {};
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'in', 'gt', 'is'])
      query[method] = () => query;
    query.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    };
    query.maybeSingle = async () => ({
      data:
        sessions.find(
          (session) =>
            session.id === filters.id &&
            (filters.meeting_id === undefined ||
              session.meeting_id === filters.meeting_id)
        ) ?? null,
      error: null,
    });
    query.then = (resolve: (value: unknown) => void) =>
      resolve(
        name === 'meet_ai_capture_streams'
          ? { count: liveStreams, error: null }
          : { data: sessions, error: null }
      );
    return query;
  };
  return { from: table, schema: () => ({ from: table }) };
}

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
const ackedOf = async (body: unknown) =>
  (await (await deliver(body)).json()).acked;

beforeEach(() => {
  vi.resetAllMocks();
  sessions = [
    row(sessionId),
    row(olderSession),
    row(foreignSession, otherMeeting),
  ];
  liveStreams = 0;
  mocks.verify.mockReturnValue(claims);
  mocks.admin.mockImplementation(async () => fakeDb());
  mocks.rpc.recordDecision.mockResolvedValue({ revision: 2, recorded: true });
  mocks.rpc.closeStream.mockResolvedValue(true);
  mocks.rpc.revokeUpload.mockResolvedValue(true);
  mocks.rpc.stopSession.mockImplementation(async (_db, input) => {
    const session = sessions.find((item) => item.id === input.sessionId);
    if (session) {
      session.capture_state = 'closed';
      session.ended_at = new Date().toISOString();
    }
    return session;
  });
  mocks.rpc.closeDrained.mockImplementation(async (_db, id) =>
    sessions.find((item) => item.id === id)
  );
});

const noWrites = () => {
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.rpc.recordDecision).not.toHaveBeenCalled();
  expect(mocks.rpc.closeStream).not.toHaveBeenCalled();
};
const body = (entries: unknown[], extra: Record<string, unknown> = {}) => ({
  roomId,
  meetingId,
  entries,
  ...extra,
});

describe('self_v1 outbox delivery credential', () => {
  it('refuses a request with no credential, even with a session cookie', async () => {
    const response = await deliver(body([entry(a, 1, 'withdraw')]), {
      cookie: 'sb-access-token=user',
    });
    expect(response.status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled();
    noWrites();
  });

  it('refuses a credential that does not verify or throws', async () => {
    mocks.verify.mockReturnValue(null);
    expect((await deliver(body([]))).status).toBe(401);
    expect(mocks.verify).toHaveBeenCalledWith('signed', 'secret');
    mocks.verify.mockImplementation(() => {
      throw new Error('bad signature');
    });
    expect((await deliver(body([]))).status).toBe(401);
    noWrites();
  });

  it.each([
    ['another purpose', { ...claims, purpose: 'attendance-ledger' }],
    ['another audience', { ...claims, aud: 'meet' }],
    ['an expired credential', { ...claims, exp: 1 }],
  ])('refuses %s', async (_label, value) => {
    mocks.verify.mockReturnValue(value);
    expect((await deliver(body([entry(a, 1, 'withdraw')]))).status).toBe(401);
    noWrites();
  });

  it('refuses a body for another room than the credential names', async () => {
    const response = await deliver({
      roomId: `${ws}:${otherMeeting}`,
      meetingId: otherMeeting,
      entries: [entry(a, 1, 'withdraw', foreignSession)],
    });
    expect(response.status).toBe(403);
    noWrites();
  });
});

describe('self_v1 outbox delivery body', () => {
  it('refuses a declared oversize body before reading it', async () => {
    const response = await deliver(body([]), {
      authorization: 'Bearer signed',
      'content-length': String(MEET_SELF_OUTBOX_MAX_BYTES + 1),
    });
    expect(response.status).toBe(413);
    noWrites();
  });

  it('refuses an oversize body without a declared length', async () => {
    const padded = JSON.stringify(
      body([], { pad: 'x'.repeat(MEET_SELF_OUTBOX_MAX_BYTES) })
    );
    expect((await deliver(padded)).status).toBe(413);
    noWrites();
  });

  it('refuses more than 64 entries', async () => {
    const entries = Array.from({ length: 65 }, (_, index) =>
      entry(a, index + 1, 'close')
    );
    expect((await deliver(body(entries))).status).toBe(400);
    noWrites();
  });

  it('refuses entries outside the documented shape', async () => {
    for (const entries of [
      [{ ...entry(a, 1, 'withdraw'), transcript: 'x' }],
      [{ ...entry(a, 1, 'withdraw'), kind: 'allow' }],
      [{ ...entry(a, 0, 'withdraw') }],
    ])
      expect((await deliver(body(entries))).status).toBe(400);
    expect((await deliver(body([], { extra: true }))).status).toBe(400);
    expect((await deliver('{not json')).status).toBe(400);
    noWrites();
  });
});

describe('self_v1 outbox delivery writes', () => {
  it('writes in order per account and acknowledges what landed', async () => {
    const acked = await ackedOf(
      body([
        entry(a, 2, 'withdraw'),
        entry(a, 1, 'withdraw'),
        entry(b, 1, 'revoke'),
      ])
    );
    expect(acked).toHaveLength(3);
    expect(acked).toEqual(
      expect.arrayContaining([ack(a, 1), ack(a, 2), ack(b, 1)])
    );
    expect(
      mocks.rpc.recordDecision.mock.calls.map((call) => call[1].roomSeq)
    ).toEqual([1, 2]);
  });

  it.each([
    ['null', { meetingId: null }],
    ['missing', { meetingId: undefined }],
  ])('accepts a %s body meeting id', async (_label, extra) => {
    const acked = await ackedOf(body([entry(a, 4, 'withdraw')], extra));
    expect(acked).toEqual([ack(a, 4)]);
  });

  it('still refuses a malformed body meeting id', async () => {
    const response = await deliver(
      body([entry(a, 4, 'withdraw')], { meetingId: 'not-a-uuid' })
    );
    expect(response.status).toBe(400);
  });

  it('resolves each entry by its own session, not the body meeting id', async () => {
    const acked = await ackedOf(
      body([entry(a, 4, 'withdraw', olderSession)], { meetingId: otherMeeting })
    );
    expect(acked).toEqual([ack(a, 4, olderSession)]);
  });

  it('never writes or acknowledges another meeting session', async () => {
    const acked = await ackedOf(
      body([entry(a, 1, 'withdraw', foreignSession), entry(b, 1, 'withdraw')])
    );
    expect(acked).toEqual([ack(b, 1)]);
    expect(mocks.rpc.recordDecision).toHaveBeenCalledTimes(1);
  });

  it('acknowledges and logs entries of a session that is gone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const acked = await ackedOf(body([entry(a, 1, 'withdraw', goneSession)]));
    expect(acked).toEqual([ack(a, 1, goneSession)]);
    expect(mocks.rpc.recordDecision).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('acknowledges a replayed delivery again without new effects', async () => {
    const replayed = body([entry(a, 1, 'withdraw')]);
    const first = await ackedOf(replayed);
    // The database treats the same room sequence and kind as a no-op.
    mocks.rpc.recordDecision.mockResolvedValue({
      revision: 2,
      recorded: false,
    });
    expect(await ackedOf(replayed)).toEqual(first);
    expect(first).toEqual([ack(a, 1)]);
  });

  it('acknowledges only the outcomes the Worker itself settled', async () => {
    mocks.rpc.recordDecision.mockRejectedValue(
      new MeetSelfRpcError(409, 'stale', '40001')
    );
    mocks.rpc.revokeUpload.mockRejectedValue(
      new MeetSelfRpcError(409, 'stale', '40001')
    );
    mocks.rpc.closeStream.mockRejectedValue(
      new MeetSelfRpcError(404, 'gone', 'P0002')
    );
    liveStreams = 1;
    const acked = await ackedOf(
      body([
        entry(a, 3, 'withdraw'),
        entry(b, 2, 'revoke'),
        entry(host, 1, 'close'),
      ])
    );
    // A stale withdraw and a missing session settle; a stale revoke retries.
    expect(acked).toEqual(expect.arrayContaining([ack(a, 3), ack(host, 1)]));
    expect(acked).toHaveLength(2);
  });

  it('leaves a failed entry and the account later entries pending', async () => {
    mocks.rpc.recordDecision.mockRejectedValue(
      new MeetSelfRpcError(503, 'down', '')
    );
    const response = await deliver(
      body([
        entry(a, 1, 'withdraw'),
        entry(a, 2, 'close'),
        entry(b, 1, 'withdraw'),
      ])
    );
    expect(response.status).toBe(200);
    expect((await response.json()).acked).toEqual([]);
    expect(mocks.rpc.closeStream).not.toHaveBeenCalled();
  });
});

describe('room end through the outbox', () => {
  it('never ends the session when its last participant stream closes', async () => {
    // Leave, heartbeat expiry, a reload or a lost open all emit close.
    liveStreams = 0;
    const acked = await ackedOf(
      body([entry(a, 5, 'close'), entry(b, 2, 'close')])
    );
    expect(acked).toHaveLength(2);
    expect(mocks.rpc.stopSession).not.toHaveBeenCalled();
    await expect(
      loadSelfSession(
        fakeDb() as never,
        { sessionId, meetingId, wsId: ws },
        'upload'
      )
    ).resolves.toMatchObject({ id: sessionId });
  });

  it('ends the session on the room end entry, then refuses uploads', async () => {
    const acked = await ackedOf(
      body([entry(a, 5, 'close'), entry(host, 6, 'end')])
    );
    expect(acked).toEqual(expect.arrayContaining([ack(a, 5), ack(host, 6)]));
    expect(mocks.rpc.stopSession).toHaveBeenCalledWith(expect.anything(), {
      sessionId,
      hostId: host,
      hard: true,
    });
    expect(mocks.rpc.closeDrained).toHaveBeenCalledWith(
      expect.anything(),
      sessionId
    );
    await expect(
      loadSelfSession(
        fakeDb() as never,
        { sessionId, meetingId, wsId: ws },
        'upload'
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it('acknowledges a repeated end without stopping again', async () => {
    await ackedOf(body([entry(host, 6, 'end')]));
    mocks.rpc.stopSession.mockClear();
    expect(await ackedOf(body([entry(host, 6, 'end')]))).toEqual([
      ack(host, 6),
    ]);
    expect(mocks.rpc.stopSession).not.toHaveBeenCalled();
  });

  it('acknowledges an end for a session that is gone', async () => {
    expect(await ackedOf(body([entry(host, 1, 'end', goneSession)]))).toEqual([
      ack(host, 1, goneSession),
    ]);
  });

  it('withholds the end acknowledgement when the stop fails', async () => {
    mocks.rpc.stopSession.mockRejectedValue(
      new MeetSelfRpcError(503, 'down', '')
    );
    const acked = await ackedOf(
      body([entry(host, 7, 'end'), entry(b, 1, 'withdraw')])
    );
    expect(acked).toEqual([ack(b, 1)]);
  });

  it('answers 503 when the session lookup fails', async () => {
    const failing: Record<string, unknown> = {
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: null, error: { code: 'x' } }),
    };
    for (const name of ['select', 'in', 'eq']) failing[name] = () => failing;
    mocks.admin.mockResolvedValue({ from: () => failing });
    expect((await deliver(body([entry(a, 1, 'close')]))).status).toBe(503);
  });
});
