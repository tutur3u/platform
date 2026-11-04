// @vitest-environment node

import {
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Synthetic workspace; no real workspace data is read.
const wsId = '0b8f6a4e-3c1d-4e2f-9a7b-5c6d7e8f9a0b';
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveAccess: vi.fn(),
}));

let attendanceRows: unknown[] = [];
let reservedRows: unknown[] = [];
let configRows: unknown[] = [];

function chain(rows: () => unknown[]) {
  const self: Record<string, unknown> = {};
  for (const method of [
    'select',
    'eq',
    'in',
    'gte',
    'lt',
    'neq',
    'or',
    'like',
    'order',
    'limit',
    'range',
  ])
    self[method] = () => self;
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
  self.then = (
    resolve: (value: unknown) => unknown,
    reject: (error: unknown) => unknown
  ) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
  return self;
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

async function missedDates() {
  const { GET } = await import('./route');
  const response = await GET(
    new Request(`http://localhost/api/v1/workspaces/${wsId}/tutoring/queue`),
    { params: Promise.resolve({ wsId }) }
  );
  if (!response) throw new Error('Tutoring queue returned no response');
  const body = await response.json();
  return (body.data as { missed_class_dates: string[] }[]).flatMap(
    (item) => item.missed_class_dates
  );
}

function usePolicy(policy: Partial<TutoringPolicy>) {
  configRows = serializeTutoringPolicyConfigRows({
    ...STANDARD_TUTORING_POLICY,
    ...policy,
  });
}

const absent = (date: string) => ({
  group_id: 'group',
  user_id: 'student',
  date,
});

beforeEach(() => {
  attendanceRows = [];
  reservedRows = [];
  configRows = [];
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  mocks.createAdminClient.mockResolvedValue({
    from: (name: string) => {
      if (name === 'user_group_attendance') return chain(() => attendanceRows);
      if (name === 'user_feedbacks') return chain(() => []);
      if (name === 'workspace_user_groups_users')
        return chain(() => attendanceRows);
      if (name === 'workspace_configs') return chain(() => configRows);
      throw new Error(`Unexpected table ${name}`);
    },
    schema: () => ({
      from: (name: string) =>
        chain(() =>
          name === 'workspace_tutoring_sessions' ? reservedRows : []
        ),
    }),
  });
});

afterEach(() => vi.useRealTimers());

describe('tutoring queue absence count-from date', () => {
  it.each([
    ['31 Oct 23:59 GMT+7', '2026-10-31T16:59:00Z'],
    ['1 Nov 00:00 GMT+7', '2026-10-31T17:00:00Z'],
    ['5 Nov 12:00 GMT+7', '2026-11-05T05:00:00Z'],
  ])('splits 31 Oct from 1 Nov at %s', async (_label, now) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    usePolicy({ absenceLookbackDays: 60, absenceCountFromDate: '2026-11-01' });
    attendanceRows = ['2026-10-20', '2026-10-31', '2026-11-01'].map(absent);
    const dates = await missedDates();
    expect(dates).not.toContain('2026-10-20');
    expect(dates).not.toContain('2026-10-31');
    // An absence on the date itself is not in the future of a 1 Nov clock;
    // before 1 Nov it can only exist as a pre-recorded row.
    expect(dates).toEqual(['2026-11-01']);
  });

  it('applies whichever of the lookback and the date is later', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T05:00:00Z'));
    attendanceRows = [
      '2026-10-25',
      '2026-10-31',
      '2026-11-01',
      '2026-11-10',
      '2026-11-18',
    ].map(absent);

    usePolicy({ absenceLookbackDays: 28, absenceCountFromDate: '2026-11-01' });
    expect(await missedDates()).toEqual([
      '2026-11-01',
      '2026-11-10',
      '2026-11-18',
    ]);

    usePolicy({ absenceLookbackDays: 7, absenceCountFromDate: '2026-11-01' });
    expect(await missedDates()).toEqual(['2026-11-18']);
  });

  it('lists every absence in the lookback when no date is set', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T05:00:00Z'));
    attendanceRows = ['2026-10-10', '2026-10-25', '2026-11-10'].map(absent);
    usePolicy({ absenceLookbackDays: 28 });
    expect(await missedDates()).toEqual(['2026-10-25', '2026-11-10']);
    configRows = [];
    expect(await missedDates()).toEqual(['2026-10-25', '2026-11-10']);
  });

  it('a make-up booked before the date does not consume a later absence', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T05:00:00Z'));
    usePolicy({ absenceLookbackDays: 60, absenceCountFromDate: '2026-11-01' });
    attendanceRows = ['2026-10-28', '2026-11-03'].map(absent);
    reservedRows = [
      {
        group_id: 'group',
        student_user_id: 'student',
        reason_type: 'ABSENT_RECOVERY',
        attendance_status: 'DONE',
        session_date: '2026-10-30',
      },
    ];
    expect(await missedDates()).toEqual(['2026-11-03']);
  });
});
