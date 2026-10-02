import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  admin: vi.fn(),
  query: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  schema: vi.fn(),
}));
vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: mocks.auth,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/inventory-core/period-pricing', () => ({
  pricingErrorStatus: (error: { code?: string }) =>
    error.code === '42P01' ? 503 : 500,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET } from './route';

const id = '00000000-0000-4000-8000-000000000001';
const invoice = '00000000-0000-4000-8000-000000000002';
const request = new Request('https://example.test/receipt?actor_id=evil');
const params = { params: Promise.resolve({ wsId: 'alias', requestId: id }) };
const grant = (allowed = true) =>
  mocks.auth.mockResolvedValue({
    ok: true,
    value: {
      wsId: 'canonical',
      userId: 'current-actor',
      permissions: {
        containsPermission: (p: string) =>
          allowed && p === 'create_inventory_sales',
      },
    },
  });
describe('authenticated inventory request recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant();
    const chain = {
      select: mocks.select,
      eq: mocks.eq,
      maybeSingle: mocks.query,
    };
    mocks.schema.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue(chain);
    mocks.select.mockReturnValue(chain);
    mocks.eq.mockReturnValue(chain);
    mocks.admin.mockResolvedValue({ schema: mocks.schema });
    mocks.query.mockResolvedValue({
      data: { invoice_id: invoice },
      error: null,
    });
  });
  it('returns minimal matching receipt using canonical membership actor, never client actor', async () => {
    const response = await GET(request, params);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      state: 'committed',
      request_id: id,
      invoice_id: invoice,
    });
    expect(mocks.eq.mock.calls).toEqual([
      ['ws_id', 'canonical'],
      ['actor_id', 'current-actor'],
      ['request_id', id],
    ]);
    expect(mocks.select).toHaveBeenCalledWith('invoice_id');
  });
  it('permission denial does not read private data', async () => {
    grant(false);
    expect((await GET(request, params)).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('failed canonical membership/auth is forwarded without admin read', async () => {
    mocks.auth.mockResolvedValue({
      ok: false,
      response: new Response('Forbidden', { status: 403 }),
    });
    const response = await GET(request, params);
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('invalid UUID does not read private data', async () => {
    expect(
      (
        await GET(request, {
          params: Promise.resolve({ wsId: 'alias', requestId: 'bad' }),
        })
      ).status
    ).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('absence returns not_observed, never a terminal rejection or replacement permission', async () => {
    mocks.query.mockResolvedValue({ data: null, error: null });
    expect(await (await GET(request, params)).json()).toEqual({
      state: 'not_observed',
      request_id: id,
    });
  });
  it('missing rollout schema stays unavailable instead of empty receipt', async () => {
    mocks.query.mockResolvedValue({ data: null, error: { code: '42P01' } });
    expect((await GET(request, params)).status).toBe(503);
  });
  it('malformed receipt and storage errors cannot masquerade as missing', async () => {
    mocks.query.mockResolvedValue({ data: { invoice_id: 'bad' }, error: null });
    expect((await GET(request, params)).status).toBe(500);
    mocks.query.mockRejectedValue(new Error('Unavailable'));
    expect((await GET(request, params)).status).toBe(500);
  });
});
