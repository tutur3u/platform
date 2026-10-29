// @vitest-environment node

import {
  EASY_CENTER_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from '@tuturuuu/internal-api/tutoring-policy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
// Hosted PostgREST returns at most this many rows per select.
const MAX_ROWS = 1000;
const absentLearnerId = '9b2f6d4e-3c1a-4e8b-9f7d-2a6c5e4b3d1f';
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveAccess: vi.fn(),
}));

let attendanceRows: unknown[] = [];
let configRows: unknown[] = [];

function query(rows: () => unknown[]) {
  let from = 0;
  let to = Number.POSITIVE_INFINITY;
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    gte: () => builder,
    lte: () => builder,
    lt: () => builder,
    neq: () => builder,
    like: () => builder,
    order: () => builder,
    limit: () => builder,
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
      const data = rows().slice(from, Math.min(to + 1, from + MAX_ROWS));
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

async function listQueue(search: string) {
  const { GET } = await import('./route');
  const response = await GET(
    new Request(
      `http://localhost/api/v1/workspaces/${wsId}/tutoring/queue?${search}`
    ),
    { params: Promise.resolve({ wsId }) }
  );
  if (!response) throw new Error('Tutoring queue returned no response');
  return response.json();
}

beforeEach(() => {
  configRows = serializeTutoringPolicyConfigRows(EASY_CENTER_TUTORING_POLICY);
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  mocks.createAdminClient.mockResolvedValue({
    from: (name: string) => {
      if (name === 'user_group_attendance') return query(() => attendanceRows);
      if (name === 'user_feedbacks') return query(() => []);
      if (name === 'workspace_configs')
        return {
          ...query(() => configRows),
          maybeSingle: async () => ({ data: null, error: null }),
        };
      throw new Error(`Unexpected table ${name}`);
    },
    schema: () => ({ from: () => query(() => []) }),
  });
});

afterEach(() => vi.useRealTimers());

describe('tutoring queue past the PostgREST row cap', () => {
  // 10:00 GMT+7 on 29 Oct, and 01:30 GMT+7 on 29 Oct while UTC is still 28 Oct.
  it.each([
    ['yesterday (GMT+7)', '2026-10-28', '2026-10-29T03:00:00Z'],
    [
      'yesterday (GMT+7), before UTC midnight',
      '2026-10-28',
      '2026-10-28T18:30:00Z',
    ],
    ['today (GMT+7)', '2026-10-29', '2026-10-29T03:00:00Z'],
    [
      'today (GMT+7), before UTC midnight',
      '2026-10-29',
      '2026-10-28T18:30:00Z',
    ],
  ])(
    'lists an absence from %s behind a full page of earlier absences',
    async (_label, date, now) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(now));
      // A large center: a full page of absences in groups that sort first.
      attendanceRows = [
        ...Array.from({ length: MAX_ROWS }, (_, index) => ({
          group_id: 'group-a',
          user_id: `student-${String(index).padStart(4, '0')}`,
          date: '2026-10-20',
          group: { name: 'A class' },
          user: { full_name: `Learner ${index}` },
        })),
        {
          group_id: 'group-z',
          user_id: absentLearnerId,
          date,
          group: { name: 'Z class' },
          user: { full_name: 'Absent Learner' },
        },
      ];

      const body = await listQueue(`studentUserId=${absentLearnerId}`);

      expect(body.data).toMatchObject([
        {
          absence_deficit: 1,
          group_id: 'group-z',
          missed_class_dates: [date],
          reason_type: 'ABSENT_RECOVERY',
          student_user_id: absentLearnerId,
        },
      ]);
      expect((await listQueue('')).summary.absent).toBe(MAX_ROWS + 1);
    }
  );
});
