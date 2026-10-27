import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  admin: vi.fn(),
  context: vi.fn(),
  permissions: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: state.admin,
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: state.permissions,
}));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: state.context,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/utils/user-helper', () => ({
  getCurrentWorkspaceUser: vi.fn(),
}));
vi.mock('@/lib/post-email-queue', () => ({
  cancelPendingPostEmailsForWorkspaceUser: vi.fn(),
  isWorkspaceUserInactiveForPostEmail: vi.fn(),
  POST_EMAIL_INACTIVE_RECIPIENT_REASON: 'inactive',
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('../../src/lib/workspace-api-key', () => ({
  validateWorkspaceApiKey: vi.fn(),
}));
vi.mock('../../src/routes/users/workspace-user-create', () => ({
  handleCreateWorkspaceUserRequest: vi.fn(),
}));
vi.mock('../../src/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: state.permissions,
}));

import { GET as vitals } from '../../../../apps/web/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/members/[userId]/vitals/route';
import { GET as attendance } from '../../../../apps/web/src/app/api/v1/workspaces/[wsId]/users/[userId]/attendance/route';
import { GET as userDetail } from '../../../../apps/web/src/app/api/v1/workspaces/[wsId]/users/[userId]/route';
import { GET as users } from '../../src/routes/users/list';

type Row = Record<string, unknown>;
const privateUser = {
  id: 'student-a',
  ws_id: 'workspace-a',
  full_name: 'Synthetic student',
  display_name: 'Student',
  avatar_url: null,
  group_count: 1,
  linked_users: [],
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  email: 'synthetic@example.invalid',
  phone: 'dummy-phone',
  birthday: '2000-01-01',
  gender: 'dummy',
  ethnicity: 'dummy',
  guardian: 'dummy-guardian',
  national_id: 'dummy-id',
  address: 'dummy-address',
  note: 'dummy-note',
  archival_note: 'dummy-archival-note',
  attendance_count: 7,
};
const tables: Record<string, Row[]> = {
  workspace_users: [privateUser, { id: 'student-b', ws_id: 'workspace-b' }],
  workspace_user_groups: [
    { id: 'class-a', ws_id: 'workspace-a' },
    { id: 'class-b', ws_id: 'workspace-b' },
  ],
  user_group_attendance: [
    {
      user_id: 'student-a',
      group_id: 'class-a',
      date: '2026-10-05',
      status: 'PRESENT',
      session_id: null,
      groups: {
        id: 'class-a',
        name: 'Synthetic class A',
        ws_id: 'workspace-a',
      },
    },
    {
      user_id: 'student-b',
      group_id: 'class-b',
      date: '2026-10-05',
      status: 'PRESENT',
      session_id: null,
      groups: {
        id: 'class-b',
        name: 'Synthetic class B',
        ws_id: 'workspace-b',
      },
    },
    {
      user_id: 'student-a',
      group_id: 'class-b',
      date: '2026-10-05',
      status: 'PRESENT',
      session_id: null,
      groups: {
        id: 'class-b',
        name: 'Synthetic class B',
        ws_id: 'workspace-b',
      },
    },
  ],
  user_indicators: [
    {
      user_id: 'student-a',
      value: 8,
      user_group_metrics: {
        id: 'metric-a',
        name: 'Score A',
        unit: 'points',
        factor: 1,
        is_weighted: false,
        group_id: 'class-a',
        workspace_user_groups: { ws_id: 'workspace-a' },
      },
    },
    {
      user_id: 'student-b',
      value: 9,
      user_group_metrics: {
        id: 'metric-b',
        name: 'Score B',
        unit: 'points',
        factor: 1,
        is_weighted: false,
        group_id: 'class-b',
        workspace_user_groups: { ws_id: 'workspace-b' },
      },
    },
  ],
};
function valueAt(row: Row, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (value, part) =>
        value && typeof value === 'object'
          ? Reflect.get(value, part)
          : undefined,
      row
    );
}
function query(initial: Row[]) {
  let rows = [...initial];
  let selection = '';
  const q = {
    select: (value: string) => {
      selection = value;
      return q;
    },
    eq: (key: string, value: unknown) => {
      if (key.includes('.') && !selection.includes('!inner')) {
        const [relation] = key.split('.');
        rows = rows.map((row) =>
          valueAt(row, key) === value ? row : { ...row, [relation ?? '']: null }
        );
      } else {
        rows = rows.filter((row) => valueAt(row, key) === value);
      }
      return q;
    },
    in: (key: string, values: unknown[]) => {
      rows = rows.filter((row) => values.includes(valueAt(row, key)));
      return q;
    },
    gte: (key: string, value: string) => {
      rows = rows.filter(
        (row) => String(valueAt(row, key)) >= value.slice(0, 10)
      );
      return q;
    },
    lt: (key: string, value: string) => {
      rows = rows.filter(
        (row) => String(valueAt(row, key)) < value.slice(0, 10)
      );
      return q;
    },
    order: (_key: string, _options: unknown) => q,
    range: (_from: number, _to: number) => q,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({ data: rows[0] ?? null, error: null }),
    // biome-ignore lint/suspicious/noThenProperty: Model Supabase query builders, which are intentionally awaitable.
    then: (
      resolve: (value: { data: Row[]; count: number; error: null }) => unknown
    ) =>
      Promise.resolve(resolve({ data: rows, count: rows.length, error: null })),
  };
  return q;
}
const client = {
  from: vi.fn((table: string) => query(tables[table] ?? [])),
  rpc: vi.fn((_name: string, args: { _ws_id: string }) =>
    query(
      (tables.workspace_users ?? []).filter((row) => row.ws_id === args._ws_id)
    )
  ),
};
function setPermissions(...permissions: string[]) {
  const allowed = new Set(permissions);
  const effective = {
    wsId: 'workspace-a',
    containsPermission: (permission: string) => allowed.has(permission),
    withoutPermission: (permission: string) => !allowed.has(permission),
  };
  state.permissions.mockResolvedValue(effective);
  state.context.mockResolvedValue({
    context: {
      normalizedWsId: 'workspace-a',
      sbAdmin: client,
      permissions: effective,
    },
  });
}
const request = (path: string) =>
  new NextRequest(
    `https://example.invalid/api/v1/workspaces/workspace-a/${path}`
  );
const attendanceParams = (userId = 'student-a') => ({
  params: Promise.resolve({ wsId: 'workspace-a', userId }),
});
const vitalsParams = (groupId = 'class-a', userId = 'student-a') => ({
  params: Promise.resolve({ wsId: 'workspace-a', groupId, userId }),
});

describe('workspace user read authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.admin.mockResolvedValue(client);
    setPermissions();
  });
  it('denies attendance without the attendance permission', async () => {
    const response = await attendance(
      request('users/student-a/attendance?month=2026-10'),
      attendanceParams()
    );
    expect(response.status).toBe(403);
    expect(client.from).not.toHaveBeenCalled();
  });
  it('does not return another workspace user attendance', async () => {
    setPermissions('check_user_attendance');
    const response = await attendance(
      request('users/student-b/attendance?month=2026-10'),
      attendanceParams('student-b')
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });
  it('returns only attendance from the authorized workspace', async () => {
    setPermissions('check_user_attendance');
    const response = await attendance(
      request('users/student-a/attendance?month=2026-10'),
      attendanceParams()
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attendance).toHaveLength(1);
    expect(body.attendance[0].groups.name).toBe('Synthetic class A');
  });
  it('rejects a foreign class filter even for an authorized user', async () => {
    setPermissions('check_user_attendance');
    const response = await attendance(
      request('users/student-a/attendance?month=2026-10&groupIds=class-b'),
      attendanceParams()
    );
    expect(response.status).toBe(404);
  });
  it.each(['guest', 'member'])(
    'denies a %s with no user read permissions',
    async () => {
      const response = await users(request('users'), {
        params: Promise.resolve({ wsId: 'workspace-a' }),
      });
      expect(response.status).toBe(403);
      expect(client.rpc).not.toHaveBeenCalled();
    }
  );
  it('redacts private fields for public user readers', async () => {
    setPermissions('view_users_public_info');
    const response = await users(request('users'), {
      params: Promise.resolve({ wsId: 'workspace-a' }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.count).toBe(1);
    expect(body.data[0].full_name).toBe(privateUser.full_name);
    for (const field of [
      'email',
      'phone',
      'birthday',
      'gender',
      'ethnicity',
      'guardian',
      'national_id',
      'address',
      'note',
      'archival_note',
      'attendance_count',
    ]) {
      expect(body.data[0], field).not.toHaveProperty(field);
    }
  });
  it('preserves private fields but redacts public fields for private-only readers', async () => {
    setPermissions('view_users_private_info');
    const response = await users(request('users'), {
      params: Promise.resolve({ wsId: 'workspace-a' }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data[0].national_id).toBe(privateUser.national_id);
    for (const field of [
      'avatar_url',
      'full_name',
      'display_name',
      'group_count',
      'linked_users',
      'created_at',
      'updated_at',
      'attendance_count',
    ]) {
      expect(body.data[0], field).not.toHaveProperty(field);
    }
  });
  it('preserves the list shape for fully authorized mobile and web readers', async () => {
    setPermissions(
      'view_users_private_info',
      'view_users_public_info',
      'check_user_attendance'
    );
    const response = await users(request('users'), {
      params: Promise.resolve({ wsId: 'workspace-a' }),
    });
    expect(await response.json()).toEqual({ data: [privateUser], count: 1 });
  });
  it('denies scores without the scores permission', async () => {
    const response = await vitals(
      request('user-groups/class-a/members/student-a/vitals'),
      vitalsParams()
    );
    expect(response.status).toBe(403);
    expect(client.from).not.toHaveBeenCalled();
  });
  it('denies a class belonging to a different workspace', async () => {
    setPermissions('view_user_groups_scores');
    const response = await vitals(
      request('user-groups/class-b/members/student-b/vitals'),
      vitalsParams('class-b', 'student-b')
    );
    expect(response.status).toBe(404);
  });
  it('denies a user belonging to a different workspace', async () => {
    setPermissions('view_user_groups_scores');
    const response = await vitals(
      request('user-groups/class-a/members/student-b/vitals'),
      vitalsParams('class-a', 'student-b')
    );
    expect(response.status).toBe(404);
  });
  it('returns the existing scores shape for an authorized reader', async () => {
    setPermissions('view_user_groups_scores');
    const response = await vitals(
      request('user-groups/class-a/members/student-a/vitals'),
      vitalsParams()
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: 'metric-a',
        name: 'Score A',
        unit: 'points',
        factor: 1,
        is_weighted: false,
        value: 8,
      },
    ]);
  });
  it('denies user detail without user read permissions', async () => {
    const response = await userDetail(
      request('users/student-a'),
      attendanceParams()
    );
    expect(response.status).toBe(403);
    expect(client.from).not.toHaveBeenCalled();
  });
  it('redacts private fields on the existing user detail array', async () => {
    setPermissions('view_users_public_info');
    const response = await userDetail(
      request('users/student-a'),
      attendanceParams()
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].full_name).toBe(privateUser.full_name);
    for (const field of [
      'email',
      'phone',
      'birthday',
      'gender',
      'ethnicity',
      'guardian',
      'national_id',
      'address',
      'note',
      'archival_note',
      'attendance_count',
    ]) {
      expect(body[0], field).not.toHaveProperty(field);
    }
  });
  it('preserves the full user detail for an authorized reader', async () => {
    setPermissions(
      'view_users_private_info',
      'view_users_public_info',
      'check_user_attendance'
    );
    const response = await userDetail(
      request('users/student-a'),
      attendanceParams()
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([privateUser]);
  });
  it('returns no user detail from another workspace', async () => {
    setPermissions('view_users_private_info', 'view_users_public_info');
    const response = await userDetail(
      request('users/student-b'),
      attendanceParams('student-b')
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
  it.each([attendance, vitals])(
    'denies a missing membership before reading records',
    async (handler) => {
      state.permissions.mockResolvedValue(null);
      const response = await handler(
        request('users/student-a/attendance?month=2026-10'),
        vitalsParams()
      );
      expect(response.status).toBe(404);
      expect(state.admin).not.toHaveBeenCalled();
    }
  );
  it('rejects an invalid attendance month', async () => {
    setPermissions('check_user_attendance');
    const response = await attendance(
      request('users/student-a/attendance?month=2026-99'),
      attendanceParams()
    );
    expect(response.status).toBe(400);
    expect(state.admin).not.toHaveBeenCalled();
  });
  it('accepts a valid local class filter and repeated class IDs', async () => {
    setPermissions('check_user_attendance');
    const response = await attendance(
      request(
        'users/student-a/attendance?month=2026-10&groupIds=class-a&groupIds=class-a'
      ),
      attendanceParams()
    );
    expect(response.status).toBe(200);
    expect((await response.json()).attendance).toHaveLength(1);
  });

  it('rejects a foreign class paired with a local user', async () => {
    setPermissions('view_user_groups_scores');
    const response = await vitals(
      request('user-groups/class-b/members/student-a/vitals'),
      vitalsParams('class-b', 'student-a')
    );
    expect(response.status).toBe(404);
  });
  it('uses the normalized permission workspace for attendance aliases', async () => {
    setPermissions('check_user_attendance');
    const response = await attendance(
      request('users/student-a/attendance?month=2026-10'),
      {
        params: Promise.resolve({ wsId: 'personal', userId: 'student-a' }),
      }
    );
    expect(response.status).toBe(200);
    expect((await response.json()).attendance).toHaveLength(1);
  });
  it('passes an explicit Contacts actor into shared attendance permissions', async () => {
    setPermissions('check_user_attendance');
    const { handleGetUserAttendanceRequest } = await import(
      '../../src/routes/users/attendance'
    );
    const actor = { id: 'contacts-actor', email: 'actor@example.invalid' };
    const req = request('users/student-a/attendance?month=2026-10');
    const response = await handleGetUserAttendanceRequest(
      req,
      attendanceParams(),
      actor
    );
    expect(response.status).toBe(200);
    expect(state.permissions).toHaveBeenCalledWith({
      request: req,
      user: actor,
      wsId: 'workspace-a',
    });
  });
});
