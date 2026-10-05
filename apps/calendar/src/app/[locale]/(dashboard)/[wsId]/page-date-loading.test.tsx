import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  workspace: vi.fn(),
  permissions: vi.fn(),
  admin: vi.fn(),
  token: vi.fn(),
  tasks: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  event: vi.fn(),
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
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error('not-found');
  },
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@/components/calendar-workspace-page', () => ({
  CalendarWorkspacePage: () => null,
}));

import CalendarPage from './page';

const wsId = '00000000-0000-0000-0000-000000000003';
const actor = { id: 'actor' };
const db = { from: mocks.from };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function page(
  query: { date?: string | string[]; eventId?: string | string[] } = {
    eventId: 'event-a',
  }
) {
  return CalendarPage({
    params: Promise.resolve({ wsId: 'personal', locale: 'en' }),
    searchParams: Promise.resolve(query),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue(actor);
  mocks.workspace.mockResolvedValue({ id: wsId, personal: true, joined: true });
  mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
  mocks.admin.mockResolvedValue(db);
  mocks.token.mockResolvedValue(null);
  mocks.tasks.mockResolvedValue([]);
  const query = {
    select: mocks.select,
    eq: mocks.eq,
    maybeSingle: mocks.event,
  };
  mocks.from.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.event.mockResolvedValue({
    data: { start_at: '2026-10-05T08:00:00Z' },
    error: null,
  });
});
describe('Calendar deep-link loading overlap', () => {
  it('starts actor-scoped resources before unresolved event-date lookup finishes', async () => {
    const event = deferred<{ data: { start_at: string }; error: null }>();
    mocks.event.mockReturnValue(event.promise);
    const pending = page();
    await vi.waitFor(() => expect(mocks.event).toHaveBeenCalled());
    expect(mocks.token).toHaveBeenCalledWith(db, { wsId, userId: actor.id });
    expect(mocks.tasks).toHaveBeenCalledWith({
      resolvedWsId: wsId,
      userId: actor.id,
    });
    expect(mocks.from).toHaveBeenCalledWith('workspace_calendar_events');
    expect(mocks.eq.mock.calls).toEqual([
      ['id', 'event-a'],
      ['ws_id', wsId],
    ]);
    event.resolve({
      data: { start_at: '2026-11-01T01:30:00-04:00' },
      error: null,
    });
    expect((await pending).props.initialDate).toBe('2026-11-01T05:30:00.000Z');
  });
  it('does not start resources or linked-event reads before the exact permission gate succeeds', async () => {
    const permission = deferred<{ withoutPermission: () => boolean }>();
    mocks.permissions.mockReturnValue(permission.promise);
    const pending = page();
    await vi.waitFor(() => expect(mocks.permissions).toHaveBeenCalled());
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.tasks).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
    permission.resolve({ withoutPermission: () => false });
    await pending;
  });
  it('keeps valid date-only links without event lookup and preserves the first event ID', async () => {
    const result = await page({
      date: ['2026-11-01', 'invalid'],
      eventId: ['event-a', 'other'],
    });
    expect(result.props.initialDate).toBe('2026-11-01');
    expect(result.props.initialEventId).toBe('event-a');
    expect(mocks.event).not.toHaveBeenCalled();
  });
  it('normalizes valid instant links and bypasses event lookup', async () => {
    const result = await page({
      date: '2026-11-01T01:30:00-04:00',
      eventId: 'event-a',
    });
    expect(result.props.initialDate).toBe('2026-11-01T05:30:00.000Z');
    expect(mocks.event).not.toHaveBeenCalled();
  });
  it.each(['2026-02-30', 'invalid'])(
    'falls back to the scoped event date for invalid date %s',
    async (date) => {
      expect((await page({ date, eventId: 'event-a' })).props.initialDate).toBe(
        '2026-10-05T08:00:00.000Z'
      );
      expect(mocks.event).toHaveBeenCalledOnce();
    }
  );
  it.each([null, { start_at: null }, { start_at: 'invalid' }])(
    'retains an undefined date when the stored event has no usable instant (%s)',
    async (data) => {
      mocks.event.mockResolvedValue({ data, error: null });
      expect((await page()).props.initialDate).toBeUndefined();
    }
  );
  it('does not query an event for an invalid date without event ID', async () => {
    expect((await page({ date: 'invalid' })).props.initialDate).toBeUndefined();
    expect(mocks.event).not.toHaveBeenCalled();
  });
  it('preserves the event-query error even if an independent read already rejected', async () => {
    const event = deferred<{ data: null; error: { message: string } }>();
    mocks.event.mockReturnValue(event.promise);
    mocks.tasks.mockRejectedValue(new Error('task transport'));
    const error = { message: 'event query failure' };
    const pending = page();
    const expected = expect(pending).rejects.toBe(error);
    await vi.waitFor(() => expect(mocks.event).toHaveBeenCalled());
    event.resolve({ data: null, error });
    await expected;
  });
  it('propagates the first independent-read rejection after successful event resolution', async () => {
    const token = deferred<null>();
    const tasks = deferred<[]>();
    mocks.token.mockReturnValue(token.promise);
    mocks.tasks.mockReturnValue(tasks.promise);
    const pending = page();
    const first = new Error('task transport');
    const expected = expect(pending).rejects.toBe(first);
    await vi.waitFor(() => expect(mocks.event).toHaveBeenCalled());
    tasks.reject(first);
    await expected;
    token.reject(new Error('later token transport'));
  });
});
