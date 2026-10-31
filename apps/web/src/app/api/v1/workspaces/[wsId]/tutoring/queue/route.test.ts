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
let lessonRows: unknown[] = [];
let postRows: unknown[] = [];
let canViewPosts = true;
let lessonError: unknown = null;

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
    lt() {
      return this;
    },
    neq() {
      return this;
    },
    or() {
      return this;
    },
    like() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    range() {
      return this;
    },
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
    then(
      resolve: (value: unknown) => unknown,
      reject: (error: unknown) => unknown
    ) {
      const data = rows();
      const error = data === lessonRows ? lessonError : null;
      return Promise.resolve({ data: error ? null : data, error }).then(
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
  lessonRows = [];
  postRows = [];
  canViewPosts = true;
  lessonError = null;
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: {
      withoutPermission: (permission: string) =>
        permission === 'view_user_groups_posts' && !canViewPosts,
    },
  });
  mocks.createAdminClient.mockResolvedValue({
    from: (name: string) => {
      if (name === 'user_group_attendance') return query(() => attendanceRows);
      if (name === 'user_feedbacks') return query(() => feedbackRows);
      // Every learner is a current member of each class its rows name.
      if (name === 'workspace_user_groups_users')
        return query(() => [...attendanceRows, ...feedbackRows]);
      if (name === 'workspace_configs')
        return {
          ...query(() => configRows),
          maybeSingle: async () => ({ data: null, error: null }),
        };
      throw new Error(`Unexpected table ${name}`);
    },
    schema: () => ({
      from: (name: string) =>
        query(() => {
          if (name === 'workspace_user_group_sessions') return lessonRows;
          if (name === 'user_group_posts') return postRows;
          return reservedRows;
        }),
    }),
  });
});

afterEach(() => vi.useRealTimers());

describe('tutoring support queue', () => {
  it.each(['DONE', 'PENDING'])(
    'does not let an earlier %s make-up consume a later absence',
    async (status) => {
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
          attendance_status: status,
          session_date: '2026-09-10',
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
    }
  );
  it('a make-up after the eligible absence still reserves its credit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
    attendanceRows = [
      { group_id: 'group', user_id: 'student', date: '2026-09-20' },
    ];
    reservedRows = [
      {
        group_id: 'group',
        student_user_id: 'student',
        reason_type: 'ABSENT_RECOVERY',
        attendance_status: 'PENDING',
        session_date: '2026-09-25',
      },
    ];
    expect((await (await listQueue()).json()).data).toEqual([]);
  });

  it('matches unsorted reservations once and preserves same-day absence multiplicity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
    attendanceRows = [
      '2026-09-25',
      '2026-09-20',
      '2026-09-10',
      '2026-09-20',
    ].map((date) => ({ group_id: 'group', user_id: 'student', date }));
    reservedRows = ['2026-09-21', '2026-09-05', '2026-09-12'].map(
      (session_date) => ({
        group_id: 'group',
        student_user_id: 'student',
        reason_type: 'ABSENT_RECOVERY',
        attendance_status: 'PENDING',
        session_date,
      })
    );
    const body = await (await listQueue()).json();
    expect(body.data).toMatchObject([
      { absence_deficit: 2, missed_class_dates: ['2026-09-20', '2026-09-25'] },
    ]);
  });
  it('never shares chronological reservation credits across groups or students', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
    attendanceRows = [
      { group_id: 'group', user_id: 'student', date: '2026-09-20' },
    ];
    reservedRows = [
      {
        group_id: 'other-group',
        student_user_id: 'student',
        reason_type: 'ABSENT_RECOVERY',
        attendance_status: 'DONE',
        session_date: '2026-09-25',
      },
      {
        group_id: 'group',
        student_user_id: 'other-student',
        reason_type: 'ABSENT_RECOVERY',
        attendance_status: 'PENDING',
        session_date: '2026-09-25',
      },
    ];
    expect((await (await listQueue()).json()).data).toMatchObject([
      { absence_deficit: 1, missed_class_dates: ['2026-09-20'] },
    ]);
  });
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

  it('excludes kindergarten from all tutoring by default and respects a narrower scope', async () => {
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
    expect((await (await listQueue()).json()).count).toBe(0);
    attendanceRows = [
      { ...(attendanceRows[0] as object), group: { name: 'English ABC' } },
    ];
    feedbackRows = [
      { ...(feedbackRows[0] as object), group: { name: 'English ABC' } },
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

  it('leaves tutor groups out of the make-up and weak-support queues', async () => {
    const tutorGroupId = '22222222-2222-4222-8222-222222222222';
    const today = new Date().toISOString().slice(0, 10);
    const rowsFor = (groupId: string) => {
      attendanceRows = [
        {
          group_id: groupId,
          user_id: 'student',
          date: today,
          group: { name: 'Giáo viên kèm' },
          user: { full_name: 'Lan' },
        },
      ];
      feedbackRows = [
        {
          id: 'feedback',
          group_id: groupId,
          user_id: 'student',
          content: 'Needs practice',
          created_at: new Date().toISOString(),
          group: { name: 'Giáo viên kèm' },
          user: { full_name: 'Lan' },
        },
      ];
    };
    configRows = serializeTutoringPolicyConfigRows({
      ...EASY_CENTER_TUTORING_POLICY,
      tutorGroupIds: [tutorGroupId],
    });
    rowsFor(tutorGroupId);
    const excluded = await (await listQueue()).json();
    expect(excluded.count).toBe(0);
    expect(excluded.summary).toMatchObject({ absent: 0, weak: 0 });
    // The same name in a group that is not marked stays in both queues.
    rowsFor('33333333-3333-4333-8333-333333333333');
    expect((await (await listQueue()).json()).data).toMatchObject([
      { reason_type: 'BOTH', absence_deficit: 1 },
    ]);
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

  describe('content to teach', () => {
    const absence = {
      group_id: 'group',
      user_id: 'student',
      date: '2026-09-20',
      group: { name: 'English 2' },
      user: { full_name: 'Lan' },
    };
    const lesson = (description: string | null) => ({
      group_id: 'group',
      status: 'scheduled',
      starts_at: '2026-09-20T01:00:00Z',
      start_timezone: 'Asia/Ho_Chi_Minh',
      recurrence_instance_date: null,
      description,
      description_json: null,
    });
    const flagged = (id: string, content: string, created_at: string) => ({
      id,
      group_id: 'group',
      user_id: 'student',
      content,
      created_at,
      group: { name: 'English 2' },
      user: { full_name: 'Lan' },
    });

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
    });

    it('shows the missed lesson notes for an absent item', async () => {
      attendanceRows = [absence];
      lessonRows = [lesson('Unit 3 food')];
      const body = await (await listQueue()).json();
      expect(body.data).toMatchObject([
        {
          reason_type: 'ABSENT_RECOVERY',
          feedback_content: '',
          missed_lesson_content: '2026-09-20: Unit 3 food',
          missed_post_content: '',
          missing_lesson_dates: [],
        },
      ]);
    });

    it('adds the class posts created on the missed date, after the session notes', async () => {
      attendanceRows = [absence];
      lessonRows = [lesson('Unit 3 food')];
      postRows = [
        {
          group_id: 'group',
          title: 'Bài 5',
          content: 'Phần bài viết ngày 20',
          // 03:00 on 20/09 in the class's Asia/Ho_Chi_Minh zone.
          created_at: '2026-09-19T20:00:00Z',
        },
        {
          group_id: 'group',
          title: 'Other day',
          content: 'Not the missed date',
          created_at: '2026-09-22T03:00:00Z',
        },
      ];
      const body = await (await listQueue()).json();
      expect(body.data).toMatchObject([
        {
          missed_lesson_content: '2026-09-20: Unit 3 food',
          missed_post_content: '2026-09-20: Bài 5\nPhần bài viết ngày 20',
          missing_lesson_dates: [],
        },
      ]);
    });

    it('counts a post as notes for the date, and skips posts without permission', async () => {
      attendanceRows = [absence];
      postRows = [
        {
          group_id: 'group',
          title: null,
          content: 'Ôn tập',
          created_at: '2026-09-20T03:00:00Z',
        },
      ];
      const withPost = await (await listQueue()).json();
      expect(withPost.data).toMatchObject([
        { missed_post_content: '2026-09-20: Ôn tập', missing_lesson_dates: [] },
      ]);
      canViewPosts = false;
      const without = await (await listQueue()).json();
      expect(without.data).toMatchObject([
        { missed_post_content: '', missing_lesson_dates: ['2026-09-20'] },
      ]);
    });

    it('lists the missed dates that have no recorded notes', async () => {
      attendanceRows = [absence];
      lessonRows = [lesson('  ')];
      const empty = await (await listQueue()).json();
      expect(empty.data).toMatchObject([
        { missed_lesson_content: '', missing_lesson_dates: ['2026-09-20'] },
      ]);
      lessonRows = [];
      const absent = await (await listQueue()).json();
      expect(absent.data).toMatchObject([
        { missed_lesson_content: '', missing_lesson_dates: ['2026-09-20'] },
      ]);
    });

    it('carries both the lesson notes and the homeroom note for a BOTH item', async () => {
      attendanceRows = [absence];
      lessonRows = [lesson('Unit 3 food')];
      feedbackRows = [
        flagged('fb', 'Practice phonics', '2026-09-10T00:00:00Z'),
      ];
      const body = await (await listQueue()).json();
      expect(body.data).toMatchObject([
        {
          reason_type: 'BOTH',
          feedback_content: 'Practice phonics',
          missed_lesson_content: '2026-09-20: Unit 3 food',
          missing_lesson_dates: [],
        },
      ]);
    });

    it('leaves weak-only items without lesson notes', async () => {
      feedbackRows = [
        flagged('fb', 'Practice phonics', '2026-09-10T00:00:00Z'),
      ];
      const body = await (await listQueue()).json();
      expect(body.data).toMatchObject([{ reason_type: 'WEAK_SUPPORT' }]);
      expect(body.data[0].missed_lesson_content).toBeUndefined();
      expect(body.data[0].missing_lesson_dates).toBeUndefined();
    });

    it('omits lesson fields when the lookup fails so the client reads sessions itself', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      attendanceRows = [absence];
      lessonRows = [lesson('Unit 3 food')];
      lessonError = { message: 'boom' };
      const body = await (await listQueue()).json();
      expect(body.data).toMatchObject([{ reason_type: 'ABSENT_RECOVERY' }]);
      expect(body.data[0].missed_lesson_content).toBeUndefined();
      expect(body.data[0].missed_post_content).toBeUndefined();
      expect(body.data[0].missing_lesson_dates).toBeUndefined();
      consoleError.mockRestore();
    });

    it('omits lesson fields when a lookup hits the row limit', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      attendanceRows = [absence];
      lessonRows = Array.from({ length: 1000 }, () => lesson('x'));
      const body = await (await listQueue()).json();
      expect(body.data[0].missing_lesson_dates).toBeUndefined();
      consoleError.mockRestore();
    });

    it('pins weak content to the feedback a session was opened from, not the latest', async () => {
      feedbackRows = [
        flagged('later', 'Progress note', '2026-09-24T00:00:00Z'),
        flagged(
          'trigger',
          'Moved to support: fractions',
          '2026-09-01T00:00:00Z'
        ),
      ];
      reservedRows = [
        {
          group_id: 'group',
          student_user_id: 'student',
          reason_type: 'WEAK_SUPPORT',
          attendance_status: 'DONE',
          source_feedback_id: 'trigger',
          resolved_at: '2026-09-05T00:00:00Z',
          session_date: '2026-09-05',
        },
      ];
      const body = await (await listQueue()).json();
      expect(body.data).toMatchObject([
        {
          reason_type: 'WEAK_SUPPORT',
          feedback_content: 'Moved to support: fractions',
          content_feedback_id: 'trigger',
          // Scheduling still tracks the latest flagged feedback.
          source_feedback_id: 'later',
          feedback_created_at: '2026-09-24T00:00:00Z',
        },
      ]);
    });

    it('falls back to the latest feedback when no session is tied to one', async () => {
      feedbackRows = [
        flagged('later', 'Progress note', '2026-09-24T00:00:00Z'),
        flagged('older', 'Moved to support', '2026-09-01T00:00:00Z'),
      ];
      reservedRows = [
        {
          group_id: 'group',
          student_user_id: 'student',
          reason_type: 'ABSENT_RECOVERY',
          attendance_status: 'DONE',
          source_feedback_id: null,
          session_date: '2026-09-05',
        },
      ];
      const body = await (await listQueue()).json();
      expect(body.data).toMatchObject([
        {
          feedback_content: 'Progress note',
          content_feedback_id: 'later',
          source_feedback_id: 'later',
        },
      ]);
    });
  });
});
