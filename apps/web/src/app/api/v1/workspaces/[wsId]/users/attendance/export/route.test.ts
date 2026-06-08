import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClient = vi.fn();
const getPermissions = vi.fn();
const getWorkspace = vi.fn();

const attendanceQuery = {
  eq: vi.fn(() => attendanceQuery),
  gte: vi.fn(() => attendanceQuery),
  lte: vi.fn(() => attendanceQuery),
  order: vi.fn(() => attendanceQuery),
  range: vi.fn(),
  select: vi.fn(() => attendanceQuery),
};

const sbAdmin = {
  from: vi.fn(() => attendanceQuery),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => createAdminClient(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissions>) =>
    getPermissions(...args),
  getWorkspace: (...args: Parameters<typeof getWorkspace>) =>
    getWorkspace(...args),
}));

describe('attendance export route', () => {
  beforeEach(() => {
    createAdminClient.mockResolvedValue(sbAdmin);
    getWorkspace.mockResolvedValue({ id: 'ws-1' });
    getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'check_user_attendance',
    });
    sbAdmin.from.mockClear();
    attendanceQuery.eq.mockClear();
    attendanceQuery.gte.mockClear();
    attendanceQuery.lte.mockClear();
    attendanceQuery.order.mockClear();
    attendanceQuery.range.mockReset();
    attendanceQuery.range.mockResolvedValue({
      count: 1,
      data: [
        {
          date: '2026-05-01',
          group: { id: 'group-1', name: 'Course' },
          notes: '',
          status: 'PRESENT',
          user: {
            display_name: 'Learner',
            full_name: null,
            id: 'user-1',
          },
        },
      ],
      error: null,
    });
    attendanceQuery.select.mockClear();
  });

  it('binds joined attendance users to the route workspace', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/users/attendance/export?startDate=2026-05-01&endDate=2026-05-31'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      data: [
        {
          groupId: 'group-1',
          userId: 'user-1',
          userName: 'Learner',
        },
      ],
    });
    expect(sbAdmin.from).toHaveBeenCalledWith('user_group_attendance');
    expect(attendanceQuery.select).toHaveBeenCalledWith(
      expect.stringContaining(
        'user:workspace_users!inner(id, display_name, full_name)'
      ),
      { count: 'exact' }
    );
    expect(attendanceQuery.eq).toHaveBeenCalledWith(
      'workspace_user_groups.ws_id',
      'ws-1'
    );
    expect(attendanceQuery.eq).toHaveBeenCalledWith(
      'workspace_users.ws_id',
      'ws-1'
    );
  });
});
