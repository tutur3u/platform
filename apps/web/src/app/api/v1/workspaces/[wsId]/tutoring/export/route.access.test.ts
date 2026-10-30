// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  admin: vi.fn(),
  client: vi.fn(),
}));
vi.mock('next/server', () => ({ NextResponse: { json: Response.json } }));
vi.mock('@/legacy-api-routes/head', () => ({
  createLegacyGetHandler: (f: unknown) => f,
  createLegacyHeadHandler: () => vi.fn(),
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  resolveTutoringRouteAccess: mocks.access,
  createTutoringRequestClient: mocks.client,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const ownId = '5d23287f-9094-4714-b8e0-dcce877464a1';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    normalizedWsId: wsId,
    user: { id: 'actor' },
    permissions: { withoutPermission: (p: string) => p === 'view_payroll' },
  });
  mocks.client.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'actor' } } }) },
  });
  const link = {
    select: () => link,
    eq: () => link,
    maybeSingle: async () => ({
      data: { virtual_user_id: ownId },
      error: null,
    }),
  };
  mocks.admin.mockResolvedValue({ from: () => link });
});
async function request(query: string) {
  const { GET } = await import('./route');
  return GET(new Request(`http://localhost/export?mode=payroll&${query}`), {
    params: Promise.resolve({ wsId }),
  });
}
it('rejects another teacher for view_user_groups only', async () => {
  expect((await request(`teacherId=${wsId}`))?.status).toBe(403);
});
it('rejects reversed date bounds before reading data', async () => {
  expect((await request('fromDate=2026-10-31&toDate=2026-10-01'))?.status).toBe(
    400
  );
  expect(mocks.admin).not.toHaveBeenCalled();
});
it('rejects nonexistent calendar dates', async () => {
  expect((await request('fromDate=2026-02-30'))?.status).toBe(400);
});

function allowSessionReads() {
  const filters: unknown[][] = [];
  const builder = {
    select: () => builder,
    eq: (...args: unknown[]) => {
      filters.push(args);
      return builder;
    },
    gte: (...args: unknown[]) => {
      filters.push(['gte', ...args]);
      return builder;
    },
    lte: (...args: unknown[]) => {
      filters.push(['lte', ...args]);
      return builder;
    },
    order: () => builder,
    range: async () => ({ data: [], error: null }),
  };
  return { builder, filters };
}
it('allows view_payroll to read all teachers', async () => {
  const { builder, filters } = allowSessionReads();
  mocks.access.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  mocks.admin.mockResolvedValue({ schema: () => ({ from: () => builder }) });
  expect((await request(''))?.status).toBe(200);
  expect(filters).not.toContainEqual(['teacher_user_id', ownId]);
  expect(mocks.client).not.toHaveBeenCalled();
});
it('forces the linked teacher for view_user_groups only', async () => {
  const { builder, filters } = allowSessionReads();
  const link = {
    select: () => link,
    eq: () => link,
    maybeSingle: async () => ({
      data: { virtual_user_id: ownId },
      error: null,
    }),
  };
  mocks.admin.mockResolvedValue({
    from: () => link,
    schema: () => ({ from: () => builder }),
  });
  expect((await request(''))?.status).toBe(200);
  expect(filters).toContainEqual(['teacher_user_id', ownId]);
});

it('uses inclusive lower and upper session date bounds', async () => {
  const { builder, filters } = allowSessionReads();
  mocks.access.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
  });
  mocks.admin.mockResolvedValue({ schema: () => ({ from: () => builder }) });
  expect((await request('fromDate=2026-10-01&toDate=2026-10-31'))?.status).toBe(
    200
  );
  expect(filters).toContainEqual(['gte', 'session_date', '2026-10-01']);
  expect(filters).toContainEqual(['lte', 'session_date', '2026-10-31']);
});
