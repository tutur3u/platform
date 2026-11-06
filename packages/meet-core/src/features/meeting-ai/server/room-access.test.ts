import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rpc: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-session', () => ({
  getMeetCallSession: mocks.session,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ rpc: mocks.rpc }),
}));

import { readMeetingRoomPolicy } from './room-access';

const WS = '00000000-0000-4000-8000-0000000000a1';
const MEETING = '00000000-0000-4000-8000-0000000000b1';
const OTHER_MEETING = '00000000-0000-4000-8000-0000000000b2';
const read = (userId: string, meetingId = MEETING, isHost = false) =>
  readMeetingRoomPolicy({ meetingId, wsId: WS, userId, isHost });

/** The room service answers per meeting: only that call's participants read. */
function room(participants: Record<string, string[]>) {
  mocks.session.mockImplementation(async (input) => ({
    realtimeUrl: 'wss://rooms.example.test/ws',
    token: `${input.meetingId}:${input.userId}`,
  }));
  mocks.fetch.mockImplementation(async (_url, init) => {
    const [meetingId, userId] = String(init.headers.Authorization)
      .replace('Bearer ', '')
      .split(':');
    return Response.json({
      ended: true,
      canReadNotes: participants[meetingId as string]?.includes(
        userId as string
      ),
    });
  });
}
const admins = new Set<string>();

beforeEach(() => {
  vi.resetAllMocks();
  admins.clear();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.rpc.mockImplementation(async (_name, args) => ({
    data: admins.has(`${args.p_ws_id}:${args.p_user_id}`),
    error: null,
  }));
  room({
    [MEETING]: ['participant', 'guest'],
    [OTHER_MEETING]: ['someone-else'],
  });
});

describe('transcript and notes read policy', () => {
  it('allows a participant of the call', async () => {
    expect((await read('participant')).canReadNotes).toBe(true);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('allows a workspace admin who did not join the call', async () => {
    admins.add(`${WS}:admin`);
    expect((await read('admin')).canReadNotes).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('has_workspace_permission', {
      p_ws_id: WS,
      p_user_id: 'admin',
      p_permission: 'admin',
    });
  });

  it('denies a workspace member who was not a participant', async () => {
    expect((await read('member')).canReadNotes).toBe(false);
  });

  it('denies an outsider who is neither participant nor admin', async () => {
    expect((await read('outsider')).canReadNotes).toBe(false);
  });

  it('allows a guest participant for that meeting only', async () => {
    expect((await read('guest')).canReadNotes).toBe(true);
    expect((await read('guest', OTHER_MEETING)).canReadNotes).toBe(false);
  });

  it('scopes admin to the workspace asked about', async () => {
    admins.add('another-workspace:admin');
    expect((await read('admin')).canReadNotes).toBe(false);
  });

  it('fails closed when the admin lookup errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect((await read('member')).canReadNotes).toBe(false);
  });

  it('never consults admin status for a settings change', async () => {
    admins.add(`${WS}:admin`);
    const policy = await readMeetingRoomPolicy(
      { meetingId: MEETING, wsId: WS, userId: 'admin', isHost: true },
      { shareNotes: true }
    );
    expect(policy.canReadNotes).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetch.mock.calls[0]?.[1].method).toBe('PATCH');
  });
});
