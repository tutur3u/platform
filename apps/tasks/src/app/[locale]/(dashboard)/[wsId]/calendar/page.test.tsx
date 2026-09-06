import { beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarPage from './page';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  workspace: vi.fn(),
  permissions: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.user,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: mocks.workspace,
  getPermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock(
  '@tuturuuu/tasks-ui/calendar/components/load-smart-scheduling-tasks',
  () => ({ loadSmartSchedulingTasks: vi.fn() })
);
vi.mock('@tuturuuu/tasks-ui/calendar/task-calendar-page-shell', () => ({
  TaskCalendarPageShell: () => null,
}));
vi.mock('@tuturuuu/utils/calendar-auth-token', () => ({
  fetchUserWorkspaceCalendarGoogleTokenForClient: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  notFound: () => {
    throw new Error('not-found');
  },
}));
const params = Promise.resolve({ wsId: 'workspace-1', locale: 'en' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Tasks calendar access', () => {
  it('requires the Tasks session before accessing workspace data', async () => {
    mocks.user.mockResolvedValue(null);
    await expect(CalendarPage({ params })).rejects.toThrow('redirect:/login');
    expect(mocks.user).toHaveBeenCalledWith('tasks');
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('does not load calendar data without manage_calendar permission', async () => {
    mocks.user.mockResolvedValue({ id: 'user-1' });
    mocks.workspace.mockResolvedValue({ id: 'workspace-1' });
    const withoutPermission = vi.fn().mockReturnValue(true);
    mocks.permissions.mockResolvedValue({ withoutPermission });
    await expect(CalendarPage({ params })).rejects.toThrow('not-found');
    expect(withoutPermission).toHaveBeenCalledWith('manage_calendar');
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
