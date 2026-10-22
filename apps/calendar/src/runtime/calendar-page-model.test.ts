import { beforeEach, describe, expect, it, vi } from 'vitest';

const ports = vi.hoisted(() => ({
  actor: vi.fn(),
  workspace: vi.fn(),
  permissions: vi.fn(),
  admin: vi.fn(),
  token: vi.fn(),
  tasks: vi.fn(),
}));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: ports.actor,
}));
vi.mock('@tuturuuu/utils/request-workspace', () => ({
  getRequestWorkspace: ports.workspace,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: ports.permissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: ports.admin,
}));
vi.mock('@tuturuuu/utils/calendar-auth-token', () => ({
  fetchUserWorkspaceCalendarGoogleTokenForClient: ports.token,
}));
vi.mock(
  '@tuturuuu/tasks-ui/calendar/components/load-smart-scheduling-tasks',
  () => ({ loadSmartSchedulingTasks: ports.tasks })
);
vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
  notFound: () => {
    throw new Error('not found');
  },
}));
vi.mock('next/server', () => ({ connection: async () => {} }));

import { calendarPageModel } from './calendar-page-model.server';

const props = (search: { date?: string; eventId?: string } = {}) => ({
  params: Promise.resolve({ wsId: 'personal', locale: 'vi' }),
  searchParams: Promise.resolve(search),
});
beforeEach(() => {
  vi.resetAllMocks();
  ports.actor.mockResolvedValue({ id: 'actor' });
  ports.workspace.mockResolvedValue({
    id: 'resolved-workspace',
    personal: true,
  });
  ports.permissions.mockResolvedValue({ withoutPermission: () => false });
  ports.admin.mockResolvedValue({});
  ports.token.mockResolvedValue({ id: 'public-token-projection' });
  ports.tasks.mockResolvedValue([]);
});
describe('native Calendar permission and deep-link model', () => {
  it('denies an unsigned actor before workspace and data reads', async () => {
    ports.actor.mockResolvedValue(null);
    await expect(calendarPageModel(props())).rejects.toThrow('redirect:/login');
    expect(ports.workspace).not.toHaveBeenCalled();
    expect(ports.admin).not.toHaveBeenCalled();
  });
  it('redirects missing manage_calendar before independent token/task reads', async () => {
    ports.permissions.mockResolvedValue({ withoutPermission: () => true });
    await expect(calendarPageModel(props())).rejects.toThrow(
      'redirect:/personal/tasks'
    );
    expect(ports.admin).not.toHaveBeenCalled();
    expect(ports.token).not.toHaveBeenCalled();
    expect(ports.tasks).not.toHaveBeenCalled();
  });
  it.each([
    ['2026-10-19', '2026-10-19'],
    ['2026-10-19T04:30:00+07:00', '2026-10-18T21:30:00.000Z'],
    ['2026-02-30', undefined],
  ])('preserves date-only versus instant %s', async (date, expected) => {
    const result = await calendarPageModel(props({ date }));
    expect(result.initialDate).toBe(expected);
    expect(result.experimentalGoogleToken).toEqual({
      id: 'public-token-projection',
    });
    expect(ports.tasks).toHaveBeenCalledWith({
      resolvedWsId: 'resolved-workspace',
      userId: 'actor',
    });
  });
  it('constrains linked event reads by event and resolved workspace identity', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: { start_at: '2026-10-19T10:00:00Z' },
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    ports.admin.mockResolvedValue({ from: vi.fn(() => query) });
    const result = await calendarPageModel(props({ eventId: 'event' }));
    expect(query.eq.mock.calls).toEqual([
      ['id', 'event'],
      ['ws_id', 'resolved-workspace'],
    ]);
    expect(result.initialDate).toBe('2026-10-19T10:00:00.000Z');
  });
});
