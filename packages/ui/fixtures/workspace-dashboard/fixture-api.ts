/**
 * Network fence for the workspace dashboard fixture. Every request the
 * production cards make is answered here from synthetic data; anything else
 * is rejected and recorded, so the fixture can never reach a live service.
 * The data is fictional. It proves layout and client behavior only, not
 * deployed server authorization.
 */

export type FixtureState = 'ready' | 'loading' | 'error' | 'empty' | 'partial';

export interface FixtureOptions {
  state: FixtureState;
  longNames: boolean;
  goal: 'set' | 'unset';
}

const LONG =
  'Prepare the quarterly launch checklist for every regional marketing team, partner agency and reseller';

function name(base: string, long: boolean) {
  return long ? `${base}: ${LONG}` : base;
}

function todayAt(hours: number, minutes = 0) {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function localKey(date: Date) {
  return date.toLocaleDateString('en-CA');
}

function task(id: string, label: string, end: string | null, long: boolean) {
  return {
    id,
    name: name(label, long),
    end_date: end,
    list: {
      id: 'list-open',
      name: 'Launch',
      status: 'active',
      board: { id: 'board-1', ws_id: 'fixture-ws', name: name('Website', long) },
    },
  };
}

export const fixtureCalls: { method: string; path: string }[] = [];
export const unexpectedRequests: string[] = [];

export function installFixtureApi({ state, longNames, goal }: FixtureOptions) {
  const completed = new Set<string>();
  const pending = () => new Promise<Response>(() => {});
  const fail = () => Response.json({ error: 'Fixture failure' }, { status: 500 });

  globalThis.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.origin
    );
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname;
    fixtureCalls.push({ method, path: `${path}${url.search}` });

    const isRead = method === 'GET';
    if (isRead && state === 'loading') return pending();
    const failingRead =
      isRead && (state === 'error' || (state === 'partial' && path.endsWith('/users/me/tasks')));
    if (failingRead) return fail();
    const empty = state === 'empty';

    if (path === '/api/v1/users/me/tasks') {
      const keep = <T extends { id: string }>(rows: T[]) =>
        empty ? [] : rows.filter((row) => !completed.has(row.id));
      const overdue = keep([
        task('t-overdue', 'Review onboarding copy', new Date(Date.now() - 2 * 864e5).toISOString(), longNames),
        task('t-overdue-2', 'Send vendor contract', new Date(Date.now() - 864e5).toISOString(), longNames),
      ]);
      const today = keep([task('t-today', 'Update release notes', todayAt(23, 30), longNames)]);
      const upcoming = keep([task('t-upcoming', 'Reconcile October invoices', null, longNames)]);
      return Response.json({ overdue, today, upcoming, completed: [] });
    }
    if (/\/calendar\/events$/.test(path)) {
      const data = empty
        ? []
        : [0, 9, 14, 21].map((hour) => ({
            id: `event-${hour}`,
            title: name(['All hands', 'Standup', 'Design review', 'Gym'][[0, 9, 14, 21].indexOf(hour)]!, longNames),
            location: longNames ? `${LONG} room` : 'Room 2',
            start_at: todayAt(hour),
            end_at: todayAt(hour, 45),
            color: 'BLUE',
          }));
      return Response.json({ data, count: data.length });
    }
    if (/\/time-tracking\/sessions$/.test(path) && isRead) {
      const type = url.searchParams.get('type');
      if (type === 'running') {
        return Response.json({
          session: empty
            ? null
            : {
                id: 'session-1',
                title: name('Deep work', longNames),
                start_time: new Date(Date.now() - 42 * 60_000).toISOString(),
              },
        });
      }
      if (type === 'stats') {
        return Response.json({
          stats: empty
            ? { todayTime: 0, weekTime: 0, monthTime: 0, streak: 0 }
            : { todayTime: 13_320, weekTime: 76_200, monthTime: 0, streak: 3 },
        });
      }
    }
    if (/\/time-tracking\/goals$/.test(path)) {
      return Response.json({
        goals:
          goal === 'set'
            ? [{ id: 'goal-1', category_id: null, daily_goal_minutes: 360, weekly_goal_minutes: null, is_active: true }]
            : [],
      });
    }
    if (/\/time-tracking\/stats\/period$/.test(path)) {
      return Response.json({
        totalDuration: 0,
        dailyBreakdown: empty
          ? []
          : [0, 1, 2, 3, 4, 5, 6].map((offset) => {
              const day = new Date();
              day.setDate(day.getDate() - offset);
              return { date: localKey(day), totalDuration: 1_800 * (7 - offset), breakdown: [] };
            }),
      });
    }
    // Writes used by the task-complete and timer interactions.
    if (/\/task-boards\/[^/]+\/lists$/.test(path)) {
      return Response.json({
        lists: [
          { id: 'list-open', status: 'active' },
          { id: 'list-done', status: 'done' },
        ],
      });
    }
    const taskWrite = path.match(/\/workspaces\/[^/]+\/tasks\/([^/]+)$/);
    if (taskWrite && method === 'PUT') {
      completed.add(decodeURIComponent(taskWrite[1]!));
      return Response.json({ task: { id: taskWrite[1] } });
    }
    if (/\/time-tracking\/sessions\/[^/]+$/.test(path) && method === 'PATCH') {
      return Response.json({ session: null });
    }

    unexpectedRequests.push(`${method} ${path}`);
    throw new Error(`Unexpected fixture request: ${method} ${path}`);
  };
}
