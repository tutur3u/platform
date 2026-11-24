import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flag: vi.fn(),
  payer: vi.fn(),
  room: vi.fn(),
  record: vi.fn(),
  drain: vi.fn(),
  notes: vi.fn(),
  rpc: {
    startSession: vi.fn(),
    stopSession: vi.fn(),
    closeDrained: vi.fn(),
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('../../call/server/room-service', () => ({
  callRoomService: mocks.room,
}));
vi.mock('./per-speaker-flag', () => ({ meetPerSpeakerEnabled: mocks.flag }));
vi.mock('./transcript-authority', () => ({
  requireMeetTranscriptPayer: mocks.payer,
}));
vi.mock('./self-v1-room', async (original) => ({
  ...(await original<object>()),
  selfRoom: async () => ({ access: {}, accountId: 'host' }),
  selfRoomCommands: { recordSession: mocks.record },
}));
vi.mock('./self-v1-outbox', () => ({ drainSelfOutbox: mocks.drain }));
vi.mock('./self-v1-notes', () => ({ generateSelfNotes: mocks.notes }));
vi.mock('./self-v1-rpc', async (original) => ({
  ...(await original<object>()),
  selfRpc: mocks.rpc,
}));

import { MeetAiError } from './access';
import { finishSelfSession, startSelfSession } from './self-v1-session';

const input = { db: {} as never, meetingId: 'm', wsId: 'w', hostId: 'host' };
const session = { id: 's', generation: 1, capture_state: 'active' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.flag.mockResolvedValue(true);
  mocks.payer.mockResolvedValue({ billingWorkspaceId: 'w' });
  mocks.room.mockResolvedValue({ acceptance: { revision: 1 } });
  mocks.rpc.startSession.mockResolvedValue(session);
  mocks.record.mockResolvedValue({ pending: [] });
  mocks.drain.mockResolvedValue(undefined);
  mocks.rpc.stopSession.mockResolvedValue({ ...session, capture_state: 'closed' });
});

describe('self_v1 session start', () => {
  it('starts with the host payer and records protocol and generation', async () => {
    expect(await startSelfSession(input)).toEqual({
      sessionId: 's',
      protocol: 'self_v1',
    });
    expect(mocks.rpc.startSession).toHaveBeenCalledWith(
      {},
      { meetingId: 'm', hostId: 'host', wsId: 'w' }
    );
    expect(mocks.record).toHaveBeenCalledWith(expect.anything(), {
      sessionId: 's',
      active: true,
      generation: 1,
    });
  });

  it.each([
    ['the flag is off', () => mocks.flag.mockResolvedValue(false), 403],
    [
      'the host is not a payer',
      () => mocks.payer.mockRejectedValue(new MeetAiError(403, 'no')),
      403,
    ],
    [
      'Mira is not accepted',
      () => mocks.room.mockResolvedValue({ acceptance: null }),
      409,
    ],
  ])('creates no session when %s', async (_label, arrange, status) => {
    arrange();
    await expect(startSelfSession(input)).rejects.toMatchObject({ status });
    expect(mocks.rpc.startSession).not.toHaveBeenCalled();
  });

  it('closes the session hard when the room refuses it', async () => {
    mocks.record.mockRejectedValue(new MeetAiError(409, 'mode is room'));
    await expect(startSelfSession(input)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.rpc.stopSession).toHaveBeenCalledWith(
      {},
      { sessionId: 's', hostId: 'host', hard: true }
    );
  });
});

describe('self_v1 session finish', () => {
  const finish = (row: Record<string, unknown>) =>
    finishSelfSession({
      ...input,
      session: row as never,
      meetingStartedAt: new Date().toISOString(),
    });

  it('soft-stops and waits out the drain window', async () => {
    mocks.rpc.stopSession.mockResolvedValue({
      ...session,
      capture_state: 'draining',
      drain_deadline_at: new Date(Date.now() + 20_000).toISOString(),
    });
    await expect(finish(session)).rejects.toMatchObject({ status: 409 });
    expect(mocks.rpc.stopSession).toHaveBeenCalledWith(
      {},
      { sessionId: 's', hostId: 'host', hard: false }
    );
    expect(mocks.notes).not.toHaveBeenCalled();
  });

  it('stops hard and generates nothing when the flag is off', async () => {
    mocks.flag.mockResolvedValue(false);
    mocks.rpc.stopSession.mockResolvedValue({
      ...session,
      capture_state: 'closed',
    });
    await expect(finish(session)).rejects.toMatchObject({ status: 403 });
    expect(mocks.rpc.stopSession).toHaveBeenCalledWith(
      {},
      { sessionId: 's', hostId: 'host', hard: true }
    );
    expect(mocks.notes).not.toHaveBeenCalled();
  });

  it('closes a drained session and generates the notes', async () => {
    const closed = { ...session, capture_state: 'closed' };
    mocks.rpc.closeDrained.mockResolvedValue(closed);
    const head = {
      select: vi.fn(() => head),
      eq: vi.fn(() => head),
      gt: vi.fn().mockResolvedValue({ count: 0, error: null }),
    };
    mocks.notes.mockResolvedValue({ sessionId: 's' });
    expect(
      await finishSelfSession({
        ...input,
        db: { from: () => head } as never,
        session: {
          ...session,
          capture_state: 'draining',
          drain_deadline_at: new Date(Date.now() - 1).toISOString(),
        } as never,
        meetingStartedAt: 't',
      })
    ).toEqual({ sessionId: 's' });
    expect(mocks.notes.mock.calls[0]?.[0]).toMatchObject({ session: closed });
  });
});
