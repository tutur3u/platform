// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAllRows } from '../queue/all-rows';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
// Hosted PostgREST returns at most this many rows per select.
const MAX_ROWS = 1000;
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveAccess: vi.fn(),
}));

type Row = Record<string, unknown> & { id: string };
let sessionRows: Row[] = [];
const orders: string[] = [];
const chunkSizes: number[] = [];

function query(table: string, rows: () => Row[]) {
  let from = 0;
  let to = Number.POSITIVE_INFINITY;
  let ids: string[] | null = null;
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    lte: () => builder,
    in(_column: string, values: string[]) {
      ids = values;
      chunkSizes.push(values.length);
      return builder;
    },
    order(column: string) {
      if (table === 'sessions') orders.push(column);
      return builder;
    },
    range(start: number, end: number) {
      from = start;
      to = end;
      return builder;
    },
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
    then(
      resolve: (value: unknown) => unknown,
      reject: (error: unknown) => unknown
    ) {
      const all = ids ? rows().filter((row) => ids?.includes(row.id)) : rows();
      const data = all.slice(from, Math.min(to + 1, from + MAX_ROWS));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
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

const learnerIds = Array.from({ length: 450 }, (_, i) => `learner-${i}`);
const users = (): Row[] =>
  [...learnerIds, 'teacher-1'].map((id) => ({
    id,
    full_name: `Synthetic ${id}`,
    display_name: null,
    email: null,
  }));

beforeEach(() => {
  orders.length = 0;
  chunkSizes.length = 0;
  // 2,401 sessions in one shared slot: every row ties on date and time.
  sessionRows = Array.from({ length: 2401 }, (_, i) => ({
    id: `session-${String(i).padStart(5, '0')}`,
    group_id: 'class-a',
    student_user_id: learnerIds[i % learnerIds.length],
    teacher_user_id: 'teacher-1',
    session_date: '2026-11-02',
    start_time: '17:15:00',
    duration_minutes: 45,
    reason_type: 'CUSTOM',
    content: '',
    attendance_status: 'DONE',
  }));
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  mocks.createAdminClient.mockResolvedValue({
    from: (name: string) =>
      name === 'workspace_users'
        ? query(name, users)
        : query(name, () => [{ id: 'class-a', name: 'Class A' }]),
    schema: () => ({ from: () => query('sessions', () => sessionRows) }),
  });
});

async function exportRows(mode = 'detailed') {
  const { GET } = await import('./route');
  const response = await GET(
    new Request(`http://localhost/tutoring/export?mode=${mode}`),
    { params: Promise.resolve({ wsId }) }
  );
  if (!response) throw new Error('Tutoring export returned no response');
  return response.json();
}

describe('tutoring export past the PostgREST row cap', () => {
  it('exports every session once, with names, when more than 1,000 rows tie', async () => {
    const body = await exportRows();
    const ids = body.data.map((row: { id: string }) => row.id);
    expect(ids).toHaveLength(2401);
    expect(new Set(ids).size).toBe(2401);
    expect(orders.slice(0, 3)).toEqual(['session_date', 'start_time', 'id']);
    expect(
      body.data.every(
        (row: { student_name: string }) => row.student_name !== 'N/A'
      )
    ).toBe(true);
    expect(Math.max(...chunkSizes)).toBeLessThanOrEqual(100);
    // 451 people need five chunks; every name still resolves.
    expect(chunkSizes.filter((size) => size > 1).length).toBeGreaterThanOrEqual(
      5
    );
  });

  it('counts every completed session in payroll', async () => {
    // One slot per day, so the count holds whether or not payroll merges
    // learners who share a teacher slot.
    sessionRows = sessionRows.map((row, i) => ({
      ...row,
      session_date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000)
        .toISOString()
        .slice(0, 10),
    }));
    const body = await exportRows('payroll');
    expect(body.data).toEqual([
      {
        teacher_name: 'Synthetic teacher-1',
        completed_sessions: 2401,
        total_minutes: 2401 * 45,
      },
    ]);
  });
});

describe('readAllRows page guard', () => {
  it('fails instead of reading forever', async () => {
    const fetchPage = vi.fn(async () => ({ data: [1, 2], error: null }));
    const result = await readAllRows(fetchPage, 2, 3);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(result.error).toBeInstanceOf(Error);
  });
});
