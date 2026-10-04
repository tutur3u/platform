import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorize, admin, rpc } = vi.hoisted(() => ({
  authorize: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: authorize,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient: admin }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET, POST } from './route';

const sourceId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const version = '00000000-0000-4000-8000-000000000003';
const pair = { sourceId, targetId };
const payload = {
  ...pair,
  version,
  descriptionPolicy: 'source',
  rulePolicy: 'target',
  pricePolicy: 'target',
};
const period = {
  id: sourceId,
  name: 'Source',
  description: null,
  starts_at: null,
  ends_at: null,
  pricing_mode: 'legacy',
  time_zone: null,
  product_scope: 'all',
};
const preview = {
  source: period,
  target: { ...period, id: targetId, name: 'Destination' },
  version,
  cutoff: '2026-10-03T00:00:00Z',
  expiresAt: '2026-10-03T00:05:00Z',
  page: 1,
  sourceRules: [],
  targetRules: [],
  sourceRuleCount: 0,
  targetRuleCount: 0,
  sourceRuleConflictCount: 0,
  targetRuleConflictCount: 0,
  futurePrices: [],
  futurePriceCount: 0,
  conflicts: [],
  conflictCount: 0,
  blockers: [],
  hasMore: false,
  assignmentCount: 4,
  historicalQuoteCount: 2,
};
const context = { params: Promise.resolve({ wsId: 'personal' }) };
function permitted(
  values = ['update_invoices', 'delete_invoices', 'manage_inventory_catalog']
) {
  authorize.mockResolvedValue({
    ok: true,
    value: {
      wsId: 'normalized',
      userId: 'trusted-actor',
      permissions: { containsPermission: (p: string) => values.includes(p) },
    },
  });
}
const post = (body: unknown = payload) =>
  POST(
    new Request('https://test/api', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    context
  );
const get = (query: Record<string, string> = pair) =>
  GET(new Request(`https://test/api?${new URLSearchParams(query)}`), context);
beforeEach(() => {
  vi.clearAllMocks();
  permitted();
  admin.mockResolvedValue({ schema: () => ({ rpc }) });
  rpc.mockImplementation(async (name: string) => ({
    error: null,
    data:
      name === 'inventory_season_merge_schema_ready'
        ? true
        : name === 'preview_inventory_season_merge'
          ? preview
          : { merged: true, targetId, importedPriceCount: 0 },
  }));
});
describe('season merge actor-bound contract', () => {
  it.each([401, 403, 500])(
    'preserves authorization failure %s before any privileged RPC',
    async (status) => {
      authorize.mockResolvedValue({
        ok: false,
        response: new Response(null, { status }),
      });
      expect((await get()).status).toBe(status);
      expect((await post()).status).toBe(status);
      expect(admin).not.toHaveBeenCalled();
    }
  );
  it.each([
    ['update_invoices', 'delete_invoices'],
    ['manage_inventory_catalog', 'delete_invoices'],
    ['manage_inventory_catalog', 'update_invoices'],
  ])('requires the entire role conjunction %j', async (...values) => {
    permitted(values);
    expect((await get()).status).toBe(403);
    expect((await post()).status).toBe(403);
    expect(admin).not.toHaveBeenCalled();
  });
  it('accepts legacy update_inventory permission with invoice permissions', async () => {
    permitted(['update_invoices', 'delete_invoices', 'update_inventory']);
    expect((await post()).status).toBe(200);
  });
  it.each([
    { ...payload, sourceId: 'bad' },
    { ...payload, targetId: sourceId },
    { ...payload, descriptionPolicy: undefined },
    { ...payload, rulePolicy: null },
    { ...payload, pricePolicy: 'source' },
    { ...payload, version: 'digest' },
  ])('rejects incomplete choices %j', async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects invalid JSON and page bounds', async () => {
    expect(
      (
        await POST(
          new Request('https://test/api', { method: 'POST', body: 'bad json' }),
          context
        )
      ).status
    ).toBe(400);
    for (const page of ['0', '100001', '1.5', 'bad'])
      expect((await get({ ...pair, page })).status).toBe(400);
  });
  it('binds paginated preview to normalized workspace, verified actor and frozen token', async () => {
    const result = await get({
      ...pair,
      version,
      page: '6',
      actorId: 'forged',
      wsId: 'forged',
    });
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('preview_inventory_season_merge', {
      p_ws_id: 'normalized',
      p_actor_id: 'trusted-actor',
      p_source_id: sourceId,
      p_target_id: targetId,
      p_preview_id: version,
      p_page: 6,
    });
    expect(rpc).not.toHaveBeenCalledWith(
      'apply_inventory_season_merge',
      expect.anything()
    );
  });
  it('applies explicit choices with trusted actor only', async () => {
    expect((await post({ ...payload, actorId: 'forged' })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('apply_inventory_season_merge', {
      p_ws_id: 'normalized',
      p_actor_id: 'trusted-actor',
      p_source_id: sourceId,
      p_target_id: targetId,
      p_version: version,
      p_description_policy: 'source',
      p_rule_policy: 'target',
      p_price_policy: 'target',
    });
  });
  it.each([false, null])('fails closed when readiness is %s', async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    expect((await get()).status).toBe(503);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['40001', 409],
    ['55P03', 409],
    ['23514', 409],
    ['23503', 404],
    ['42501', 403],
    ['PGRST202', 503],
    ['unknown', 500],
  ])('maps %s to sanitized %s', async (code, status) => {
    rpc.mockImplementation(async (name: string) =>
      name === 'inventory_season_merge_schema_ready'
        ? { data: true, error: null }
        : { data: null, error: { code, message: 'sensitive raw SQL' } }
    );
    const result = await post();
    expect(result.status).toBe(status);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(await result.text()).not.toContain('sensitive');
  });
  it.each([
    null,
    {},
    { ...preview, source: { ...period, name: null } },
    {
      ...preview,
      sourceRules: Array(51).fill({ id: sourceId, name: 'Product' }),
    },
  ])('rejects malformed or unbounded provider preview', async (data) => {
    rpc.mockImplementation(async (name: string) => ({
      error: null,
      data: name === 'inventory_season_merge_schema_ready' ? true : data,
    }));
    expect((await get()).status).toBe(500);
  });
});
