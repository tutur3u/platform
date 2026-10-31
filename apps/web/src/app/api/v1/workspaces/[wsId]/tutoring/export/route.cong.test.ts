// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveAccess: vi.fn(),
}));

type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };

let sessionRows: Row[] = [];
let sessionsResult: Result | null = null;
let userRows: Row[] = [];
let groupsResult: Result | null = null;

function query(result: () => Result) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    lte: () => builder,
    in: () => builder,
    order: () => builder,
    range: () => builder,
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
    then(
      resolve: (value: unknown) => unknown,
      reject: (error: unknown) => unknown
    ) {
      return Promise.resolve(result()).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock('next/server', () => ({ NextResponse: { json: Response.json } }));
vi.mock('@/legacy-api-routes/head', () => ({
  createLegacyGetHandler: (handler: unknown) => handler,
  createLegacyHeadHandler: () => async () => new Response(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  resolveTutoringRouteAccess: mocks.resolveAccess,
}));

const teacher = (id: string, name: string) => ({
  display_name: null,
  email: null,
  full_name: name,
  id,
});

const session = (id: string, student: string, overrides: Row = {}) => ({
  attendance_status: 'DONE',
  content: '',
  duration_minutes: 45,
  group_id: `group-${id}`,
  id,
  reason_type: 'ABSENT_RECOVERY',
  session_date: '2026-11-02',
  start_time: '17:15:00',
  student_user_id: student,
  teacher_user_id: 'teacher-1',
  ...overrides,
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sessionRows = [];
  sessionsResult = null;
  userRows = [teacher('teacher-1', 'Synthetic teacher')];
  groupsResult = null;
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  mocks.createAdminClient.mockResolvedValue({
    from: (name: string) =>
      query(() =>
        name === 'workspace_users'
          ? { data: userRows, error: null }
          : (groupsResult ?? {
              data: [{ id: 'group-1', name: 'Class A' }],
              error: null,
            })
      ),
    schema: () => ({
      from: () =>
        query(() => sessionsResult ?? { data: sessionRows, error: null }),
    }),
  });
});

async function exportAs(search: string) {
  const { GET } = await import('./route');
  const response = await GET(
    new Request(`http://localhost/tutoring/export${search}`),
    { params: Promise.resolve({ wsId }) }
  );
  if (!response) throw new Error('Tutoring export returned no response');
  return response;
}

async function payroll() {
  return (await (await exportAs('?mode=payroll')).json()).data;
}

describe('tutoring payroll cong', () => {
  it('pays a 60-minute shift as 1.33 cong, whatever the student count', async () => {
    sessionRows = ['1', '2', '3', '4', '5'].map((n) =>
      session(n, `learner-${n}`, { duration_minutes: 60 })
    );

    const [row] = await payroll();

    expect(row).toMatchObject({ completed_sessions: 1, total_minutes: 60 });
    expect(row.total_cong).toBe(60 / 45);
    expect(row.total_cong).toBeCloseTo(1.33, 2);
  });

  it('keeps the fraction instead of rounding it', async () => {
    sessionRows = [
      session('1', 'learner-1', { duration_minutes: 30 }),
      session('2', 'learner-2', {
        duration_minutes: 20,
        start_time: '18:00:00',
      }),
    ];

    const [row] = await payroll();

    expect(row.total_minutes).toBe(50);
    expect(row.total_cong).toBeCloseTo(1.1111, 4);
    expect(Number.isInteger(row.total_cong)).toBe(false);
  });

  it('adds fractions across shifts on different days', async () => {
    sessionRows = [
      session('1', 'learner-1', { duration_minutes: 60 }),
      session('2', 'learner-2', {
        duration_minutes: 60,
        session_date: '2026-11-03',
      }),
    ];

    const [row] = await payroll();

    expect(row).toMatchObject({ completed_sessions: 2, total_minutes: 120 });
    expect(row.total_cong).toBeCloseTo(2.6667, 4);
  });

  it('reports no payroll rows when nobody completed a session', async () => {
    expect(await payroll()).toEqual([]);
  });

  it('pays nothing for absent, cancelled or pending sessions', async () => {
    sessionRows = ['NO_SHOW', 'CANCELLED', 'PENDING'].map((status, index) =>
      session(String(index), `learner-${index}`, {
        attendance_status: status,
        session_date: `2026-11-0${index + 2}`,
      })
    );

    expect(await payroll()).toEqual([]);
  });

  it('pays a shared shift once when one learner is absent and another attends', async () => {
    sessionRows = [
      session('1', 'learner-1', { attendance_status: 'NO_SHOW' }),
      session('2', 'learner-2'),
      session('3', 'learner-3', { attendance_status: 'DONE' }),
      session('4', 'learner-4', { attendance_status: 'CANCELLED' }),
    ];

    expect(await payroll()).toEqual([
      {
        completed_sessions: 1,
        teacher_name: 'Synthetic teacher',
        total_cong: 1,
        total_minutes: 45,
      },
    ]);
  });

  it('treats the same start with a different length as a separate shift', async () => {
    sessionRows = [
      session('1', 'learner-1'),
      session('2', 'learner-2', { duration_minutes: 60 }),
    ];

    const [row] = await payroll();

    expect(row).toMatchObject({ completed_sessions: 2, total_minutes: 105 });
    expect(row.total_cong).toBeCloseTo(105 / 45, 10);
  });

  it('sorts teachers by name and falls back to display name, email, then N/A', async () => {
    userRows = [
      { display_name: ' Zed ', email: 'z@x.test', full_name: ' ', id: 't-z' },
      {
        display_name: null,
        email: ' mail@x.test ',
        full_name: null,
        id: 't-m',
      },
      teacher('t-a', 'Alice'),
      { display_name: null, email: null, full_name: null, id: 't-n' },
    ];
    sessionRows = ['t-z', 't-m', 't-a', 't-n'].map((id, index) =>
      session(String(index), `learner-${index}`, { teacher_user_id: id })
    );

    expect(
      (await payroll()).map((row: { teacher_name: string }) => row.teacher_name)
    ).toEqual(['Alice', 'mail@x.test', 'N/A', 'Zed']);
  });
});

describe('tutoring export access and failures', () => {
  it('answers 404 without access and 403 without view permission', async () => {
    mocks.resolveAccess.mockResolvedValueOnce({
      normalizedWsId: wsId,
      permissions: null,
    });
    expect((await exportAs('')).status).toBe(404);

    mocks.resolveAccess.mockResolvedValueOnce({
      normalizedWsId: wsId,
      permissions: { withoutPermission: () => true },
    });
    expect((await exportAs('')).status).toBe(403);
  });

  it('rejects an invalid query', async () => {
    const response = await exportAs('?mode=weekly&fromDate=yesterday');

    expect(response.status).toBe(400);
    expect((await response.json()).issues.length).toBeGreaterThan(0);
  });

  it('answers 500 when sessions or their relations cannot be read', async () => {
    sessionsResult = { data: null, error: new Error('db') };
    expect((await exportAs('')).status).toBe(500);

    sessionsResult = null;
    sessionRows = [session('1', 'learner-1')];
    groupsResult = { data: null, error: new Error('db') };
    expect((await exportAs('')).status).toBe(500);
  });

  it('exports detailed rows with the group and people names, filtered by every option', async () => {
    sessionRows = [
      session('1', 'learner-1', {
        content: 'Unit 4',
        group_id: 'group-1',
        student_user_id: 'learner-1',
      }),
      session('2', 'learner-2', { group_id: null, teacher_user_id: null }),
    ];
    userRows = [
      teacher('teacher-1', 'Synthetic teacher'),
      teacher('learner-1', 'Learner One'),
    ];

    const response = await exportAs(
      '?fromDate=2026-11-01&toDate=2026-11-30' +
        '&teacherId=18a911d9-358c-4fe7-936f-ef6f17be1eb8' +
        '&groupId=35d890d8-a79a-4648-b448-a206ac534d5c' +
        '&studentUserId=9a2f5b7e-3d10-4f64-8a5e-6c7d8e9f0a02' +
        '&reasonType=ABSENT_RECOVERY&attendanceStatus=DONE'
    );
    const body = await response.json();

    expect(body.mode).toBe('detailed');
    expect(body.data).toEqual([
      expect.objectContaining({
        attendance_status: 'DONE',
        content: 'Unit 4',
        group_name: 'Class A',
        student_name: 'Learner One',
        teacher_name: 'Synthetic teacher',
        time: '17:15',
      }),
      expect.objectContaining({
        group_name: 'N/A',
        student_name: 'N/A',
        teacher_name: 'N/A',
      }),
    ]);
  });
});
