// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  order: vi.fn((_column: string, _options: unknown) => query),
  range: vi.fn(async (_from: number, _to: number) => ({
    data: [
      {
        id: 'teacher',
        full_name: 'Synthetic teacher',
        display_name: null,
        memberships: [{ role: 'TEACHER' }, { role: 'TEACHER' }],
      },
    ],
    count: 25,
    error: null as unknown,
  })),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    normalizedWsId: 'verified-center',
    permissions: { withoutPermission: () => false },
  });
  mocks.admin.mockResolvedValue({ from: () => query });
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
        { id: 'teacher', full_name: 'Synthetic teacher', display_name: null },
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
  it.each(['?page=0', '?pageSize=101', `?q=${'x'.repeat(201)}`])(
    'rejects invalid bounded query %s',
    async (search) => {
      expect((await get(search)).status).toBe(400);
      expect(mocks.admin).not.toHaveBeenCalled();
    }
  );
  it('reports catalog failure rather than pretending there are no teachers', async () => {
    query.range.mockResolvedValueOnce({
      data: [],
      count: 0,
      error: { message: 'unavailable' },
    });
    expect((await get()).status).toBe(500);
  });
});
