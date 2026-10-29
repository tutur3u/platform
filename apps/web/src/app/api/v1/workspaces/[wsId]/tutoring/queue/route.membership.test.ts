// @vitest-environment node

import {
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supportQueueKeys } from './queue-membership';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const supportGroup = '0c6f3a52-8d1e-4b7a-9e2f-5a4b3c2d1e0f';
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveAccess: vi.fn(),
}));

let attendanceRows: unknown[] = [];
let feedbackRows: unknown[] = [];
let reservedRows: unknown[] = [];
let membershipRows: unknown[] = [];
let tagRows: unknown[] = [];
let configRows: unknown[] = [];
const tables: string[] = [];
// Filters applied to the membership read, as `method:args` strings.
const membershipFilters: string[] = [];
let lastBody: { data: Record<string, unknown>[] } = { data: [] };

function query(rows: () => unknown[], filters?: string[]) {
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      filters?.push(`${method}:${JSON.stringify(args)}`);
      return builder;
    };
  const builder = {
    select: () => builder,
    eq: record('eq'),
    in: record('in'),
    gte: () => builder,
    lt: () => builder,
    neq: () => builder,
    or: record('or'),
    like: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
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

const learner = (id: string) => ({
  full_name: `Synthetic learner ${id}`,
  display_name: null,
  email: null,
});
const absence = (group: string, user: string, date = '2026-10-20') => ({
  group_id: group,
  user_id: user,
  date,
  group: { name: `Class ${group}` },
  user: learner(user),
});
const member = (group: string, user: string) => ({
  group_id: group,
  user_id: user,
  group: { name: group === supportGroup ? 'Support list' : `Class ${group}` },
  user: learner(user),
});
const usePolicy = (policy: Partial<TutoringPolicy>) => {
  configRows = serializeTutoringPolicyConfigRows({
    ...STANDARD_TUTORING_POLICY,
    absenceLookbackDays: 60,
    ...policy,
  });
};

async function listQueue(search = '') {
  const { GET } = await import('./route');
  const response = await GET(
    new Request(
      `http://localhost/api/v1/workspaces/${wsId}/tutoring/queue?${search}`
    ),
    { params: Promise.resolve({ wsId }) }
  );
  if (!response) throw new Error('Tutoring queue returned no response');
  const body = await response.json();
  lastBody = body;
  return (
    body.data as {
      group_id: string;
      student_user_id: string;
      reason_type: string;
    }[]
  ).map((row) => `${row.group_id}:${row.student_user_id}:${row.reason_type}`);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-29T03:00:00Z'));
  attendanceRows = [];
  feedbackRows = [];
  reservedRows = [];
  membershipRows = [];
  tagRows = [];
  tables.length = 0;
  membershipFilters.length = 0;
  usePolicy({});
  mocks.resolveAccess.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  mocks.createAdminClient.mockResolvedValue({
    from: (name: string) => {
      tables.push(name);
      if (name === 'user_group_attendance') return query(() => attendanceRows);
      if (name === 'user_feedbacks') return query(() => feedbackRows);
      if (name === 'workspace_user_groups_users')
        return query(() => membershipRows, membershipFilters);
      if (name === 'workspace_user_group_tag_groups')
        return query(() => tagRows);
      if (name === 'workspace_configs') return query(() => configRows);
      throw new Error(`Unexpected table ${name}`);
    },
    schema: () => ({ from: () => query(() => reservedRows) }),
  });
});

afterEach(() => vi.useRealTimers());

describe('queue lists learners under their current classes', () => {
  it('drops a learner who moved class from the former class only', async () => {
    attendanceRows = [
      absence('class-old', 'learner-1'),
      absence('class-new', 'learner-1'),
    ];
    membershipRows = [member('class-new', 'learner-1')];
    expect(await listQueue()).toEqual(['class-new:learner-1:ABSENT_RECOVERY']);
  });

  it('drops a learner removed from a class, with absences and flagged feedback kept in history', async () => {
    attendanceRows = [
      absence('class-a', 'learner-removed'),
      absence('class-a', 'learner-kept'),
    ];
    feedbackRows = [
      {
        id: 'feedback-1',
        content: 'Needs reading practice',
        group_id: 'class-a',
        user_id: 'learner-removed',
        created_at: '2026-10-25T00:00:00Z',
        group: { name: 'Class class-a' },
        user: learner('learner-removed'),
      },
    ];
    membershipRows = [member('class-a', 'learner-kept')];
    expect(await listQueue()).toEqual(['class-a:learner-kept:ABSENT_RECOVERY']);
  });
});

describe('format exclusions match class tags', () => {
  it('excludes classes tagged with an excluded format and reads tags only for tag rules', async () => {
    attendanceRows = [
      absence('class-ielts', 'learner-1'),
      absence('class-general', 'learner-2'),
    ];
    membershipRows = [
      member('class-ielts', 'learner-1'),
      member('class-general', 'learner-2'),
    ];
    tagRows = [
      { group_id: 'class-ielts', tag: { name: 'IELTS' } },
      { group_id: 'class-general', tag: { name: 'General' } },
    ];
    expect(await listQueue()).toHaveLength(2);
    expect(tables).not.toContain('workspace_user_group_tag_groups');

    usePolicy({
      groupExclusions: [
        { scope: 'all', match: 'exact', value: 'ielts', target: 'tag' },
      ],
    });
    expect(await listQueue()).toEqual([
      'class-general:learner-2:ABSENT_RECOVERY',
    ]);
    expect(tables).toContain('workspace_user_group_tag_groups');
  });
});

describe('needs-tutoring support groups', () => {
  beforeEach(() => {
    attendanceRows = [absence('class-a', 'learner-absent')];
    membershipRows = [
      member('class-a', 'learner-absent'),
      member(supportGroup, 'learner-quiet'),
      member('class-b', 'learner-quiet'),
      member('class-c', 'learner-quiet'),
      member(supportGroup, 'learner-unplaced'),
    ];
  });

  it('changes nothing while no support group is configured', async () => {
    const queue = await listQueue();
    expect(queue).toEqual(['class-a:learner-absent:ABSENT_RECOVERY']);
    expect(
      supportQueueKeys(membershipRows as never[], STANDARD_TUTORING_POLICY).size
    ).toBe(0);
  });

  it('lists every current member without absences under each current class', async () => {
    usePolicy({ supportGroupIds: [supportGroup] });
    expect((await listQueue()).sort()).toEqual(
      [
        'class-a:learner-absent:ABSENT_RECOVERY',
        'class-b:learner-quiet:WEAK_SUPPORT',
        'class-c:learner-quiet:WEAK_SUPPORT',
        `${supportGroup}:learner-unplaced:WEAK_SUPPORT`,
      ].sort()
    );
  });

  it('stops listing a class once a weak-support session is pending there', async () => {
    usePolicy({ supportGroupIds: [supportGroup] });
    reservedRows = [
      {
        group_id: 'class-b',
        student_user_id: 'learner-quiet',
        reason_type: 'WEAK_SUPPORT',
        attendance_status: 'PENDING',
        source_feedback_id: null,
        resolved_at: null,
        session_date: '2026-11-02',
      },
    ];
    const queue = await listQueue();
    expect(queue).toContain('class-c:learner-quiet:WEAK_SUPPORT');
    expect(queue).not.toContain('class-b:learner-quiet:WEAK_SUPPORT');
  });
});

describe('support group rows after review', () => {
  const doneWeak = (resolvedAt: string) => ({
    group_id: 'class-b',
    student_user_id: 'learner-quiet',
    reason_type: 'WEAK_SUPPORT',
    attendance_status: 'DONE',
    source_feedback_id: null,
    resolved_at: resolvedAt,
    session_date: resolvedAt.slice(0, 10),
  });
  beforeEach(() => {
    usePolicy({ supportGroupIds: [supportGroup], reassessmentDays: 14 });
    membershipRows = [
      member(supportGroup, 'learner-quiet'),
      member('class-b', 'learner-quiet'),
      member('class-c', 'learner-quiet'),
    ];
  });

  it('marks support rows so ending weak support is not offered', async () => {
    await listQueue();
    expect(lastBody.data.every((row) => row.support_group === true)).toBe(true);
    usePolicy({});
    attendanceRows = [absence('class-b', 'learner-quiet')];
    await listQueue();
    expect(lastBody.data).toHaveLength(1);
    expect(lastBody.data[0]).not.toHaveProperty('support_group');
  });

  it('waits the reassessment interval after a completed weak-support session', async () => {
    reservedRows = [doneWeak('2026-10-26T10:00:00Z')];
    expect(await listQueue()).toEqual(['class-c:learner-quiet:WEAK_SUPPORT']);
    reservedRows = [doneWeak('2026-10-01T10:00:00Z')];
    expect((await listQueue()).sort()).toEqual([
      'class-b:learner-quiet:WEAK_SUPPORT',
      'class-c:learner-quiet:WEAK_SUPPORT',
    ]);
  });

  it('skips archived classes when expanding support members', async () => {
    membershipRows = [
      member(supportGroup, 'learner-quiet'),
      {
        ...member('class-b', 'learner-quiet'),
        group: { name: 'B', archived: true },
      },
      member('class-c', 'learner-quiet'),
    ];
    expect(await listQueue()).toEqual(['class-c:learner-quiet:WEAK_SUPPORT']);
  });

  it('keeps members under their classes when filtered by a group', async () => {
    expect(await listQueue(`groupId=${supportGroup}`)).toEqual([]);
    expect(membershipFilters.some((f) => f.startsWith('in:'))).toBe(false);
  });

  it('reads current, unarchived learners in this workspace only', async () => {
    await listQueue();
    expect(membershipFilters).toEqual(
      expect.arrayContaining([
        `eq:["group.ws_id","${wsId}"]`,
        'eq:["user.archived",false]',
        'or:["role.is.null,role.neq.TEACHER"]',
      ])
    );
  });
});
