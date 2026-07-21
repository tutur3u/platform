import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET } from './route';

const actor = { email: 'manager@example.com', id: 'actor-1' };
const context = {
  params: Promise.resolve({ userId: 'user-1', wsId: 'workspace-1' }),
};

function createAttendanceQuery(result: {
  data: unknown[] | null;
  error: unknown;
}) {
  const query = {
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    in: vi.fn(() => query),
    lt: vi.fn(() => query),
    select: vi.fn(() => query),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
    then: (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe('Contacts user attendance route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSessionUser.mockResolvedValue(actor);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'check_user_attendance',
      wsId: 'resolved-workspace-1',
    });
  });

  it('uses the Contacts app-session actor and scopes attendance to the workspace', async () => {
    const attendance = [
      {
        date: '2026-07-18',
        groups: { id: 'group-1', name: 'Guest' },
        session_id: 'session-1',
        status: 'PRESENT',
      },
    ];
    const query = createAttendanceQuery({ data: attendance, error: null });
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => query),
    });
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/user-1/attendance?month=2026-07&groupIds=group-1&groupIds=group-2'
    );

    const response = await GET(request, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ attendance });
    expect(mocks.getSatelliteAppSessionUser).toHaveBeenCalledWith('contacts');
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request,
      user: actor,
      wsId: 'workspace-1',
    });
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith(
      'groups.ws_id',
      'resolved-workspace-1'
    );
    expect(query.gte).toHaveBeenCalledWith('date', '2026-07-01T00:00:00.000Z');
    expect(query.lt).toHaveBeenCalledWith('date', '2026-08-01T00:00:00.000Z');
    expect(query.in).toHaveBeenCalledWith('group_id', ['group-1', 'group-2']);
  });

  it('rejects requests without a Contacts app-session actor', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);
    const response = await GET(
      new Request(
        'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/user-1/attendance?month=2026-07'
      ),
      context
    );

    expect(response.status).toBe(401);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('requires attendance permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
      wsId: 'resolved-workspace-1',
    });
    const response = await GET(
      new Request(
        'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/user-1/attendance?month=2026-07'
      ),
      context
    );

    expect(response.status).toBe(403);
  });

  it('rejects malformed months', async () => {
    const response = await GET(
      new Request(
        'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/user-1/attendance?month=July'
      ),
      context
    );

    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
