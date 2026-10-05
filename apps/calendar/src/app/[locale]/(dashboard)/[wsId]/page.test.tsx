import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  workspace: vi.fn(),
  permissions: vi.fn(),
  admin: vi.fn(),
  token: vi.fn(),
  tasks: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.actor,
}));
vi.mock('@tuturuuu/utils/request-workspace', () => ({
  getRequestWorkspace: mocks.workspace,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/calendar-auth-token', () => ({
  fetchUserWorkspaceCalendarGoogleTokenForClient: mocks.token,
}));
vi.mock(
  '@tuturuuu/tasks-ui/calendar/components/load-smart-scheduling-tasks',
  () => ({ loadSmartSchedulingTasks: mocks.tasks })
);
vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@/components/calendar-workspace-page', () => ({
  CalendarWorkspacePage: () => null,
}));

import CalendarPage from './page';

const actor = { id: 'actor', email: 'fixture@example.test' };
const canonicalId = '00000000-0000-0000-0000-000000000003';
const workspace = { id: canonicalId, personal: true, joined: true };
function page(wsId = 'personal') {
  return CalendarPage({
    params: Promise.resolve({ wsId, locale: 'en' }),
    searchParams: Promise.resolve({}),
  });
}
function noCalendarData() {
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.tasks).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue(actor);
  mocks.workspace.mockResolvedValue(workspace);
  mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
  mocks.admin.mockResolvedValue({});
  mocks.token.mockResolvedValue(null);
  mocks.tasks.mockResolvedValue([]);
});
describe('Calendar canonical workspace permission boundary', () => {
  it.each(['personal', 'internal', canonicalId])(
    'checks the verified UUID for %s while keeping the actor unchanged',
    async (slug) => {
      const result = await page(slug);
      expect(mocks.actor).toHaveBeenCalledWith('calendar');
      expect(mocks.workspace).toHaveBeenCalledWith(slug, {
        useAdmin: true,
        user: actor,
      });
      const permissionArgs = mocks.permissions.mock.calls[0]![0];
      expect(permissionArgs.wsId).toBe(canonicalId);
      expect(permissionArgs.user).toBe(actor);
      expect(mocks.tasks).toHaveBeenCalledWith({
        resolvedWsId: canonicalId,
        userId: actor.id,
      });
      expect(result.props.workspace).toBe(workspace);
    }
  );
  it('does not start permission or protected-data reads before workspace verification resolves', async () => {
    let resolve!: (value: typeof workspace) => void;
    mocks.workspace.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const pending = page();
    await vi.waitFor(() => expect(mocks.workspace).toHaveBeenCalled());
    expect(mocks.permissions).not.toHaveBeenCalled();
    noCalendarData();
    resolve(workspace);
    await pending;
    expect(mocks.permissions).toHaveBeenCalledWith({
      user: actor,
      wsId: canonicalId,
    });
  });
  it('redirects signed-out actors before workspace or calendar data access', async () => {
    mocks.actor.mockResolvedValue(null);
    await expect(page()).rejects.toThrow('redirect:/login');
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.permissions).not.toHaveBeenCalled();
    noCalendarData();
  });
  it('does not query permissions for an unresolved workspace', async () => {
    mocks.workspace.mockResolvedValue(null);
    await expect(page()).rejects.toThrow('not-found');
    expect(mocks.permissions).not.toHaveBeenCalled();
    noCalendarData();
  });
  it('retains not-found permission failure without protected reads', async () => {
    mocks.permissions.mockResolvedValue(null);
    await expect(page()).rejects.toThrow('not-found');
    noCalendarData();
  });
  it.each(['personal', canonicalId])(
    'retains the %s URL slug in the permission-denied redirect',
    async (slug) => {
      const denied = vi.fn(
        (permission: string) => permission === 'manage_calendar'
      );
      mocks.permissions.mockResolvedValue({ withoutPermission: denied });
      await expect(page(slug)).rejects.toThrow(`redirect:/${slug}/tasks`);
      expect(denied).toHaveBeenCalledWith('manage_calendar');
      noCalendarData();
    }
  );
  it('propagates permission lookup rejection without starting scheduling reads', async () => {
    mocks.permissions.mockRejectedValue(new Error('permission transport'));
    await expect(page()).rejects.toThrow('permission transport');
    noCalendarData();
  });
});
