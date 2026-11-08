import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createAdmin: vi.fn(),
  eq: vi.fn(),
  range: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdmin,
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: async () => ({
    ok: true,
    sbAdmin: await mocks.createAdmin(),
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({ containsPermission: () => true }),
}));
vi.mock('./migration-export-auth', () => ({
  authorizeInfrastructureMigrationExport: mocks.authorize,
}));

const workspace = '11111111-1111-4111-8111-111111111111';
const query = {
  select: () => query,
  eq: mocks.eq,
  order: () => query,
  range: mocks.range,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eq.mockReturnValue(query);
  mocks.range.mockResolvedValue({ data: [], error: null, count: 0 });
  mocks.createAdmin.mockResolvedValue({
    from: () => query,
    schema: () => ({ from: () => query }),
  });
});

describe.each([
  { name: 'users', load: () => import('./users/route') },
  { name: 'bills', load: () => import('./bills/route') },
  { name: 'bill-coupons', load: () => import('./bill-coupons/route') },
  { name: 'bill-packages', load: () => import('./bill-packages/route') },
  { name: 'class-attendance', load: () => import('./class-attendance/route') },
  { name: 'class-members', load: () => import('./class-members/route') },
  { name: 'class-packages', load: () => import('./class-packages/route') },
  { name: 'class-scores', load: () => import('./class-scores/route') },
  { name: 'classes', load: () => import('./classes/route') },
  {
    name: 'student-feedbacks',
    load: () => import('./student-feedbacks/route'),
  },
  {
    name: 'user-status-changes',
    load: () => import('./user-status-changes/route'),
  },
  { name: 'roles', load: () => import('./roles/route') },
  { name: 'score-names', load: () => import('./score-names/route') },
  {
    name: 'product-categories',
    load: () => import('./product-categories/route'),
  },
  {
    name: 'transaction-categories',
    load: () => import('./transaction-categories/route'),
  },
  {
    name: 'package-stock-changes',
    load: () => import('./package-stock-changes/route'),
  },
  { name: 'lessons', load: () => import('./lessons/route') },
])('$name export authorization', ({ name, load }) => {
  it('SR-227 denies root viewers without target workspace migration permission', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: Response.json({}, { status: 403 }),
    });
    const { GET } = await load();
    const response = await GET(
      new Request(`http://localhost/api/${name}?ws_id=personal`)
    );
    expect(response.status).toBe(403);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });
  it('scopes allowed exports to the normalized workspace and caps pagination', async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      value: { wsId: workspace, userId: 'operator' },
    });
    const { GET } = await load();
    const response = await GET(
      new Request(
        `http://localhost/api/${name}?ws_id=personal&limit=999999&offset=-10`
      )
    );
    expect(response.status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith(expect.any(String), workspace);
    expect(mocks.range).toHaveBeenCalledWith(0, 999);
  });
});
