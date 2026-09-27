// @vitest-environment node

import {
  EASY_CENTER_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from '@tuturuuu/internal-api/tutoring-policy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveAccess: vi.fn(),
}));

let attendanceRows: unknown[] = [];
let reservedRows: unknown[] = [];
let feedbackRows: unknown[] = [];
let configRows: unknown[] = [];

function query(rows: () => unknown[]) {
  return {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    in() {
      return this;
    },
    gte() {
      return this;
    },
    like() {
      return this;
    },
    order() {
      return this;
    },
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
    then(
      resolve: (value: unknown) => unknown,
      reject: (error: unknown) => unknown
    ) {
      return Promise.resolve({ data: rows(), error: null }).then(
        resolve,
        reject
      );
    },
  };
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

async function listQueue() {
  const { GET } = await import('./route');
  const response = await GET(
    new Request(`http://localhost/api/v1/workspaces/${wsId}/tutoring/queue`),
    {
      params: Promise.resolve({ wsId }),
    }
  );
  if (!response) throw new Error('Tutoring queue returned no response');
  return response;
}

beforeEach(() => {
  attendanceRows = [];
  reservedRows = [];
  feedbackRows = [];
  configRows = [];
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  mocks.createAdminClient.mockResolvedValue({
    from: (name: string) => {
      if (name === 'user_group_attendance') return query(() => attendanceRows);
      if (name === 'user_feedbacks') return query(() => feedbackRows);
      if (name === 'workspace_configs')
        return {
          ...query(() => configRows),
          maybeSingle: async () => ({ data: null, error: null }),
        };
      throw new Error(`Unexpected table ${name}`);
    },
    schema: () => ({ from: () => query(() => reservedRows) }),
  });
});

afterEach(() => vi.useRealTimers());

describe('tutoring support queue', () => {
  it('limits make-up deficits and completed credits to the recent attendance window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
    attendanceRows = [
      { group_id: 'group', user_id: 'student', date: '2026-07-01' },
      { group_id: 'group', user_id: 'student', date: '2026-09-20' },
    ];
    reservedRows = [
      {
        group_id: 'group',
        student_user_id: 'student',
        reason_type: 'ABSENT_RECOVERY',
        attendance_status: 'DONE',
        session_date: '2026-07-05',
      },
    ];
    const body = await (await listQueue()).json();
    expect(body.data).toMatchObject([
      {
        absence_deficit: 1,
        missed_class_dates: ['2026-09-20'],
        reason_type: 'ABSENT_RECOVERY',
      },
    ]);
  });

  it('counts a pending make-up once instead of suggesting it again', async () => {
    attendanceRows = Array.from({ length: 2 }, () => ({
      group_id: 'group',
      user_id: 'student',
      date: new Date().toISOString().slice(0, 10),
      group: { name: 'English 2' },
      user: { full_name: 'Lan' },
    }));
    reservedRows = [
      {
        group_id: 'group',
        student_user_id: 'student',
        reason_type: 'ABSENT_RECOVERY',
        attendance_status: 'PENDING',
        session_date: new Date().toISOString().slice(0, 10),
      },
    ];
    const response = await listQueue();
    const body = await response.json();
    expect(body.data).toMatchObject([
      { absence_deficit: 1, reason_type: 'ABSENT_RECOVERY' },
    ]);
  });

  it('waits for reassessment after completed support and suppresses pending support', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
    feedbackRows = [
      {
        id: 'feedback',
        group_id: 'group',
        user_id: 'student',
        content: 'Needs practice',
        created_at: '2026-09-01T00:00:00Z',
        group: { name: 'English 2' },
        user: { full_name: 'Lan' },
      },
    ];
    reservedRows = [
      {
        group_id: 'group',
        student_user_id: 'student',
        reason_type: 'WEAK_SUPPORT',
        attendance_status: 'DONE',
        source_feedback_id: 'feedback',
        resolved_at: '2026-09-20T00:00:00Z',
      },
    ];
    expect((await (await listQueue()).json()).count).toBe(0);
    reservedRows = [
      { ...(reservedRows[0] as object), resolved_at: '2026-09-10T00:00:00Z' },
    ];
    expect((await (await listQueue()).json()).data).toMatchObject([
      { reason_type: 'WEAK_SUPPORT', source_feedback_id: 'feedback' },
    ]);
    reservedRows = [
      { ...(reservedRows[0] as object), attendance_status: 'PENDING' },
    ];
    expect((await (await listQueue()).json()).count).toBe(0);
  });

  it('excludes DDT from all tutoring by default and respects a narrower scope', async () => {
    configRows = serializeTutoringPolicyConfigRows(EASY_CENTER_TUTORING_POLICY);
    attendanceRows = [
      {
        group_id: 'ddt-group',
        user_id: 'student',
        date: new Date().toISOString().slice(0, 10),
        group: { name: 'Kindergarten DDT' },
        user: { full_name: 'Lan' },
      },
    ];
    feedbackRows = [
      {
        id: 'feedback',
        group_id: 'ddt-group',
        user_id: 'student',
        content: 'Needs practice',
        created_at: new Date().toISOString(),
        group: { name: 'Kindergarten DDT' },
        user: { full_name: 'Lan' },
      },
    ];
    expect((await (await listQueue()).json()).count).toBe(0);
    attendanceRows = [
      { ...(attendanceRows[0] as object), group: { name: 'Kindergarten ABC' } },
    ];
    feedbackRows = [
      { ...(feedbackRows[0] as object), group: { name: 'Kindergarten ABC' } },
    ];
    expect((await (await listQueue()).json()).data).toMatchObject([
      { reason_type: 'BOTH', absence_deficit: 1 },
    ]);
    attendanceRows = [
      { ...(attendanceRows[0] as object), group: { name: 'Kindergarten DDT' } },
    ];
    feedbackRows = [
      { ...(feedbackRows[0] as object), group: { name: 'Kindergarten DDT' } },
    ];
    configRows = serializeTutoringPolicyConfigRows({
      ...EASY_CENTER_TUTORING_POLICY,
      groupExclusions: [
        { scope: 'weak_support', match: 'contains', value: 'DDT' },
      ],
    });
    const body = await (await listQueue()).json();
    expect(body.data).toMatchObject([
      { reason_type: 'ABSENT_RECOVERY', absence_deficit: 1 },
    ]);
    expect(body.summary).toMatchObject({ absent: 1, weak: 0 });
  });

  it('raises an office review when weak content is unchanged for two weeks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
    configRows = serializeTutoringPolicyConfigRows(EASY_CENTER_TUTORING_POLICY);
    feedbackRows = [
      {
        id: 'latest',
        group_id: 'group',
        user_id: 'student',
        content: 'Practice Unit 3',
        created_at: '2026-09-26T12:00:00Z',
        group: { name: 'Class 246' },
        user: { full_name: 'Lan' },
      },
      {
        id: 'older',
        group_id: 'group',
        user_id: 'student',
        content: 'Practice  Unit 3',
        created_at: '2026-09-12T12:00:00Z',
        group: { name: 'Class 246' },
        user: { full_name: 'Lan' },
      },
    ];
    const body = await (await listQueue()).json();
    expect(body.data).toMatchObject([
      {
        reason_type: 'WEAK_SUPPORT',
        content_review_due: true,
        content_unchanged_since: '2026-09-12T12:00:00Z',
      },
    ]);
    expect(body.summary.review_due).toBe(1);
    reservedRows = [
      {
        group_id: 'group',
        student_user_id: 'student',
        reason_type: 'WEAK_SUPPORT',
        attendance_status: 'PENDING',
        source_feedback_id: 'latest',
      },
    ];
    const pending = await (await listQueue()).json();
    expect(pending.data).toMatchObject([
      { review_only: true, content_review_due: true },
    ]);
    expect(pending.summary).toMatchObject({ weak: 0, review_due: 1 });
  });
});
