import { DEFAULT_FEE_NOTICE_TEMPLATE } from '@tuturuuu/finance-core/fee-lock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from '../fake-supabase.test-utils';

const mocks = vi.hoisted(() => ({ gate: vi.fn() }));
vi.mock('../access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../access')>()),
  getFeeLockRouteContext: mocks.gate,
}));

const { GET, PUT } = await import('./route');
// Synthetic fixture ids only.
const WS = '00000000-0000-4000-8000-0000000fe010';
const ACTOR = '00000000-0000-4000-8000-0000000fe0a1';
const params = { params: Promise.resolve({ wsId: 'ws' }) };
const input = {
  body: '{{student_name}}: {{total}}đ. {{payment_line}}',
  item_format: '{{name}}: {{price}}đ',
  item_separator: ', ',
  payment_line: 'Cảm ơn {{centre_name}}',
  notice_grouping: 'combined',
  locale: 'vi',
};
const row = (version: number, is_active: boolean) => ({
  id: `row-${version}`,
  ws_id: WS,
  version,
  is_active,
  ...input,
  created_by: ACTOR,
  created_at: '2026-11-04T10:00:00Z',
});
const allow = (db: ReturnType<typeof fakeSupabase>) =>
  mocks.gate.mockResolvedValue({
    context: { normalizedWsId: WS, sbAdmin: db.client, user: { id: ACTOR } },
  });
const put = (body: unknown) =>
  PUT(
    new Request('https://finance.test/template', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    params
  );

describe('GET /finance/fee-locks/template', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs view_invoices and serves the built-in default before any save', async () => {
    const db = fakeSupabase({ fee_notice_templates: { data: [] } });
    allow(db);
    const response = await GET(new Request('https://finance.test/t'), params);
    expect(mocks.gate).toHaveBeenCalledWith(expect.any(Request), 'ws', [
      'view_invoices',
    ]);
    expect(await response.json()).toEqual({
      template: { ...DEFAULT_FEE_NOTICE_TEMPLATE, version: null },
      versions: [],
    });
    expect(db.filtered('fee_notice_templates', 'ws_id', WS)).toBe(true);
  });

  it('returns the active version and the history without row ids', async () => {
    const db = fakeSupabase({
      fee_notice_templates: { data: [row(3, true), row(2, false)] },
    });
    allow(db);
    const body = await (
      await GET(new Request('https://finance.test/t'), params)
    ).json();
    expect(body.template).toEqual({ ...input, version: 3 });
    expect(body.versions.map((v: { version: number }) => v.version)).toEqual([
      3, 2,
    ]);
    expect(JSON.stringify(body)).not.toMatch(/row-|ws_id/);
  });
});

describe('PUT /finance/fee-locks/template', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs manage_finance; the gate response passes through with no write', async () => {
    const db = fakeSupabase();
    mocks.gate.mockResolvedValue({
      response: new Response(null, { status: 403 }),
    });
    expect((await put(input)).status).toBe(403);
    expect(mocks.gate).toHaveBeenCalledWith(expect.any(Request), 'ws', [
      'manage_finance',
    ]);
    expect(db.client.rpc).not.toHaveBeenCalled();
  });

  it('rejects bad fields and unknown placeholders before calling SQL', async () => {
    const db = fakeSupabase();
    allow(db);
    expect((await put({ ...input, body: ' ' })).status).toBe(400);
    expect((await put({ ...input, notice_grouping: 'x' })).status).toBe(400);
    const response = await put({ ...input, body: '{{phone}} {{constructor}}' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'FEE_NOTICE_TEMPLATE_INVALID',
      issues: [
        { field: 'body', code: 'unknown_placeholder', name: 'phone' },
        { field: 'body', code: 'unknown_placeholder', name: 'constructor' },
      ],
    });
    expect(db.client.rpc).not.toHaveBeenCalled();
  });

  it('saves through the private function with the gate workspace and actor', async () => {
    const db = fakeSupabase(
      {},
      { fee_notice_template_save: { data: row(4, true) } }
    );
    allow(db);
    const response = await put({
      ...input,
      expected_version: 3,
      restored_from: 2,
    });
    expect(response.status).toBe(200);
    expect(db.rpcCalls).toEqual([
      {
        fn: 'fee_notice_template_save',
        args: {
          p_ws_id: WS, p_actor_id: ACTOR, p_body: input.body, p_item_format: input.item_format,
          p_item_separator: ', ', p_payment_line: input.payment_line, p_notice_grouping: 'combined',
          p_locale: 'vi', p_expected_version: 3, p_restored_from: 2,
        },
      },
    ]); // biome-ignore format: one arg map
    expect(db.client.schema).toHaveBeenCalledWith('private');
    const body = await response.json();
    expect(body).toMatchObject({ version: 4, is_active: true });
    expect(body).not.toHaveProperty('ws_id');
  });

  it('answers 409 with the current template on a stale version, 400 on SQL validation', async () => {
    const stale = fakeSupabase(
      { fee_notice_templates: { data: [row(5, true)] } },
      { fee_notice_template_save: { error: { code: '40001' } } }
    );
    allow(stale);
    const response = await put({ ...input, expected_version: 3 });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'FEE_NOTICE_TEMPLATE_VERSION_CONFLICT',
      current: { version: 5 },
    });
    const invalid = fakeSupabase(
      {},
      {
        fee_notice_template_save: {
          error: { code: '22023', message: 'unknown placeholder' },
        },
      }
    );
    allow(invalid);
    expect((await put(input)).status).toBe(400);
  });
});
