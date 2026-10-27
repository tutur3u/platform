// @vitest-environment node
import {
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tutorGroup = '22222222-2222-4222-8222-222222222222';
const classGroup = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({ access: vi.fn(), admin: vi.fn() }));
vi.mock('next/server', () => ({
  NextResponse: { json: Response.json },
  connection: async () => {},
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  resolveTutoringRouteAccess: mocks.access,
}));
const query = {
  select: vi.fn((_columns: string, _options: unknown) => query),
  eq: vi.fn((_column: string, _value: string) => query),
  or: vi.fn((_filter: string) => query),
  in: vi.fn((_column: string, _values: string[]) => query),
  order: vi.fn((_column: string, _options: unknown) => query),
  range: vi.fn(async (_from: number, _to: number) => ({
    data: [
      {
        id: 'teacher',
        full_name: 'Synthetic teacher',
        display_name: null,
        memberships: [
          { role: 'TEACHER', group_id: classGroup },
          { role: 'TEACHER', group_id: classGroup },
        ],
      },
    ],
    count: 25,
    error: null as unknown,
  })),
};
let policyRows: { id: string; value: string }[] = [];
const policyQuery = {
  select: vi.fn(() => policyQuery),
  eq: vi.fn(() => policyQuery),
  like: vi.fn(async () => ({ data: policyRows, error: null as unknown })),
};
let tutorRows: { user_id: string }[] = [];
const tutorQuery = {
  select: vi.fn((_columns: string) => tutorQuery),
  eq: vi.fn((_column: string, _value: string) => tutorQuery),
  in: vi.fn(async (_column: string, _values: string[]) => ({
    data: tutorRows,
    error: null as unknown,
  })),
};
beforeEach(() => {
  vi.clearAllMocks();
  policyRows = [];
  tutorRows = [];
  mocks.access.mockResolvedValue({
    normalizedWsId: 'verified-center',
    permissions: { withoutPermission: () => false },
  });
  mocks.admin.mockResolvedValue({
    from: (table: string) =>
      table === 'workspace_configs'
        ? policyQuery
        : table === 'workspace_user_groups_users'
          ? tutorQuery
          : query,
  });
});
async function get(search = '') {
  const { GET } = await import('./route');
  return GET(new Request(`http://localhost/teachers${search}`), {
    params: Promise.resolve({ wsId: 'url-center' }),
  });
}
describe('center teacher catalog', () => {
  it('returns paginated distinct identities without membership or workspace metadata', async () => {
    const response = await get('?page=2&pageSize=20');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        {
          id: 'teacher',
          full_name: 'Synthetic teacher',
          display_name: null,
          isTutor: false,
          isClassTeacher: true,
        },
      ],
      count: 25,
      page: 2,
      pageSize: 20,
      totalPages: 2,
    });
    expect(query.range).toHaveBeenCalledWith(20, 39);
    expect(query.eq).toHaveBeenCalledWith('ws_id', 'verified-center');
    expect(query.eq).toHaveBeenCalledWith(
      'memberships.group.ws_id',
      'verified-center'
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('marks tutor-only, class-only and both roles from the policy tutor groups', async () => {
    policyRows = serializeTutoringPolicyConfigRows({
      ...STANDARD_TUTORING_POLICY,
      tutorGroupIds: [tutorGroup],
    });
    query.range.mockResolvedValueOnce({
      data: [
        {
          id: 'tutor',
          full_name: 'Tutor',
          display_name: null,
          memberships: [{ role: 'TEACHER', group_id: tutorGroup }],
        },
        {
          id: 'class',
          full_name: 'Class',
          display_name: null,
          memberships: [{ role: 'TEACHER', group_id: classGroup }],
        },
        {
          id: 'both',
          full_name: 'Both',
          display_name: null,
          memberships: [
            { role: 'TEACHER', group_id: classGroup },
            { role: 'TEACHER', group_id: tutorGroup },
          ],
        },
      ],
      count: 3,
      error: null,
    });
    const body = await (await get()).json();
    expect(
      body.data.map(
        (row: { id: string; isTutor: boolean; isClassTeacher: boolean }) => [
          row.id,
          row.isTutor,
          row.isClassTeacher,
        ]
      )
    ).toEqual([
      ['tutor', true, false],
      ['class', false, true],
      ['both', true, true],
    ]);
  });
  it('lists only tutors on request without hiding their class roles', async () => {
    policyRows = serializeTutoringPolicyConfigRows({
      ...STANDARD_TUTORING_POLICY,
      tutorGroupIds: [tutorGroup],
    });
    tutorRows = [{ user_id: 'both' }, { user_id: 'both' }];
    query.range.mockResolvedValueOnce({
      data: [
        {
          id: 'both',
          full_name: 'Both',
          display_name: null,
          memberships: [
            { role: 'TEACHER', group_id: classGroup },
            { role: 'TEACHER', group_id: tutorGroup },
          ],
        },
      ],
      count: 1,
      error: null,
    });
    const body = await (await get('?tutorsOnly=true')).json();
    expect(tutorQuery.in).toHaveBeenCalledWith('group_id', [tutorGroup]);
    expect(tutorQuery.eq).toHaveBeenCalledWith(
      'group.ws_id',
      'verified-center'
    );
    expect(query.in).toHaveBeenCalledWith('id', ['both']);
    expect(body.data).toMatchObject([
      { id: 'both', isTutor: true, isClassTeacher: true },
    ]);
  });
  it('returns no tutors when no tutor group is configured', async () => {
    query.range.mockResolvedValueOnce({ data: [], count: 0, error: null });
    const body = await (await get('?tutorsOnly=true')).json();
    expect(tutorQuery.in).not.toHaveBeenCalled();
    expect(query.in).toHaveBeenCalledWith('id', []);
    expect(body.data).toEqual([]);
  });
  it('keeps punctuation and wildcards inside quoted search operands', async () => {
    await get(`?q=${encodeURIComponent('A,B"_%')}`);
    const filter = query.or.mock.calls[0]?.[0];
    expect(filter).toBe(
      'full_name.ilike."%A,B\\"\\\\_\\\\%%",display_name.ilike."%A,B\\"\\\\_\\\\%%"'
    );
  });
  it('denies unauthorized viewers before using admin access', async () => {
    mocks.access.mockResolvedValue({
      permissions: { withoutPermission: () => true },
    });
    expect((await get()).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([
    '?page=0',
    '?pageSize=101',
    '?tutorsOnly=maybe',
    `?q=${'x'.repeat(201)}`,
  ])('rejects invalid bounded query %s', async (search) => {
    expect((await get(search)).status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('reports catalog failure rather than pretending there are no teachers', async () => {
    query.range.mockResolvedValueOnce({
      data: [],
      count: 0,
      error: { message: 'unavailable' },
    });
    expect((await get()).status).toBe(500);
  });
});
