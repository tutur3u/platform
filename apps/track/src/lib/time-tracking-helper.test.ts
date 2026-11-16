import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  resolveCoMemberNames: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/co-member-names', () => ({
  resolveCoMemberNames: mocks.resolveCoMemberNames,
}));

import {
  applyCoMemberGroupNames,
  type GroupedSession,
  getGroupedSessionsPaginated,
} from './time-tracking-helper';

const WS_ID = '11111111-1111-4111-8111-111111111111';
const VIEWER_ID = 'viewer-1';

function group(
  sessionId: string,
  displayName: string | null,
  period = '2026-11-16'
): GroupedSession {
  return {
    title: `${displayName ?? 'Unknown User'} - ${period}`,
    category: null,
    sessions: [{ id: sessionId } as GroupedSession['sessions'][number]],
    totalDuration: 60,
    periodDuration: 60,
    firstStartTime: '2026-11-16T00:00:00.000Z',
    lastEndTime: null,
    status: 'completed',
    user: { displayName, avatarUrl: null },
    period,
  };
}

function fakeAdmin(rows: unknown[]) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(async () => ({ data: rows, error: null })),
  };
  return { client: { from: vi.fn(() => query) }, query };
}

describe('applyCoMemberGroupNames (D246)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names a nameless co-member group by email for a member viewer', async () => {
    const admin = fakeAdmin([
      {
        id: 'session-2',
        user_id: 'user-2',
        user: { display_name: null, handle: 'nameless' },
      },
    ]);
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([['user-2', 'nameless@example.com']])
    );

    const result = await applyCoMemberGroupNames(
      [group('session-1', 'Named User'), group('session-2', null)],
      { wsId: WS_ID, viewerUserId: VIEWER_ID, admin: admin.client as never }
    );

    expect(admin.client.from).toHaveBeenCalledWith('time_tracking_sessions');
    expect(admin.query.eq).toHaveBeenCalledWith('ws_id', WS_ID);
    expect(admin.query.in).toHaveBeenCalledWith('id', ['session-2']);
    expect(mocks.resolveCoMemberNames).toHaveBeenCalledWith({
      admin: admin.client,
      wsId: WS_ID,
      viewerUserId: VIEWER_ID,
      users: [{ id: 'user-2', display_name: null, handle: 'nameless' }],
    });
    expect(result[0]?.title).toBe('Named User - 2026-11-16');
    expect(result[1]?.title).toBe('nameless@example.com - 2026-11-16');
    expect(result[1]?.user).toEqual({
      displayName: 'nameless@example.com',
      avatarUrl: null,
    });
    expect(result[1]).not.toHaveProperty('email');
  });

  it('keeps the handle when HIDE_MEMBER_EMAIL withholds the email', async () => {
    const admin = fakeAdmin([
      {
        id: 'session-2',
        user_id: 'user-2',
        user: { display_name: null, handle: 'nameless' },
      },
    ]);
    // The resolver applies HIDE_MEMBER_EMAIL and returns the handle.
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([['user-2', 'nameless']])
    );

    const [result] = await applyCoMemberGroupNames([group('session-2', null)], {
      wsId: WS_ID,
      viewerUserId: VIEWER_ID,
      admin: admin.client as never,
    });

    expect(result?.title).toBe('nameless - 2026-11-16');
    expect(JSON.stringify(result)).not.toContain('@');
  });

  it('never looks up emails without an authenticated viewer', async () => {
    const groups = [group('session-2', null)];
    const result = await applyCoMemberGroupNames(groups, {
      wsId: WS_ID,
      viewerUserId: null,
    });

    expect(result).toBe(groups);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.resolveCoMemberNames).not.toHaveBeenCalled();
  });

  it('fails closed to the original groups when the lookup errors', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(async () => ({ data: null, error: { message: 'boom' } })),
    };
    const groups = [group('session-2', null)];
    const result = await applyCoMemberGroupNames(groups, {
      wsId: WS_ID,
      viewerUserId: VIEWER_ID,
      admin: { from: vi.fn(() => query) } as never,
    });

    expect(result).toBe(groups);
    expect(mocks.resolveCoMemberNames).not.toHaveBeenCalled();
  });
});

describe('getGroupedSessionsPaginated viewer naming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies co-member names to RPC groups for the given viewer', async () => {
    const rpcGroup = group('session-2', null);
    const client = {
      rpc: vi.fn(async () => ({
        data: {
          data: [{ ...rpcGroup, sessionCount: 1, sessionTitles: [] }],
          pagination: { page: 1, limit: 20, total: 1, pages: 1 },
        },
        error: null,
      })),
    };
    const admin = fakeAdmin([
      {
        id: 'session-2',
        user_id: 'user-2',
        user: { display_name: null, handle: null },
      },
    ]);
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([['user-2', 'nameless@example.com']])
    );

    const result = await getGroupedSessionsPaginated(
      WS_ID,
      'day',
      { page: 1, limit: 20 },
      client as never,
      { viewerUserId: VIEWER_ID, admin: admin.client as never }
    );

    expect(mocks.resolveCoMemberNames).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: WS_ID, viewerUserId: VIEWER_ID })
    );
    expect(result.data[0]?.user.displayName).toBe('nameless@example.com');
    expect(result.pagination.total).toBe(1);
  });
});
