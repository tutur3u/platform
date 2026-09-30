import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  admin: vi.fn(),
  list: vi.fn(),
  rpc: vi.fn(),
  config: vi.fn(),
}));
vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: mocks.auth,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: mocks.config,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/inventory-core/period-pricing', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/inventory-core/period-pricing')
  >()),
  listPeriodPrices: mocks.list,
  periodPricingRpc: mocks.rpc,
}));
import { GET, POST } from './route';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const params = {
  params: Promise.resolve({ wsId: 'workspace-alias', periodId: id(1) }),
};
const payload = {
  product_id: id(2),
  unit_id: id(3),
  warehouse_id: id(4),
  price: 60000,
  starts_on: '2026-10-03',
  ends_on: '2026-10-04',
};
const write = (body: unknown = payload) =>
  POST(
    new Request('http://localhost/prices', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    params
  );
function grant(...granted: string[]) {
  mocks.auth.mockResolvedValue({
    ok: true,
    value: {
      wsId: id(5),
      userId: id(6),
      permissions: {
        containsPermission: (permission: string) =>
          granted.includes(permission),
      },
    },
  });
}
describe('season price API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant('manage_inventory_catalog');
    mocks.config.mockResolvedValue('VND');
    mocks.admin.mockResolvedValue({});
    mocks.list.mockResolvedValue([]);
    mocks.rpc.mockResolvedValue({ id: id(7) });
  });
  it('requires catalog-management permission to author, regardless of sale permission', async () => {
    grant('create_inventory_sales');
    expect((await write()).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses normalized authorized workspace and explicit workspace currency', async () => {
    expect((await write()).status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith(
      {},
      'author_inventory_period_price',
      expect.objectContaining({
        p_ws_id: id(5),
        p_actor_id: id(6),
        p_currency: 'VND',
        p_price: 60000,
      })
    );
  });
  it('rejects malformed payloads, reversed dates and currency precision before writes', async () => {
    expect((await write({ ...payload, price: 8.1 })).status).toBe(400);
    expect((await write({ ...payload, ends_on: '2026-10-02' })).status).toBe(
      400
    );
    expect((await write({})).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not invent a currency when configuration is unavailable', async () => {
    mocks.config.mockResolvedValue(null);
    expect((await write()).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('maps overlap/scope conflicts and missing migration safely', async () => {
    mocks.rpc.mockRejectedValue({ code: '23P01' });
    expect((await write()).status).toBe(409);
    mocks.rpc.mockRejectedValue({ code: 'PGRST202' });
    expect((await write()).status).toBe(503);
  });
  it('permits authorized seller reads and prevents browser caching of quotes', async () => {
    grant('create_inventory_sales');
    const response = await GET(new Request('http://localhost/prices'), params);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.list).toHaveBeenCalledWith({}, id(5), id(1));
    grant();
    expect(
      (await GET(new Request('http://localhost/prices'), params)).status
    ).toBe(403);
  });
});
