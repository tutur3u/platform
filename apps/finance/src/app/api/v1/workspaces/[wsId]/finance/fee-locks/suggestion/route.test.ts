import { feeLockSnapshotSchema } from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from '../fake-supabase.test-utils';

const mocks = vi.hoisted(() => ({ gate: vi.fn() }));
vi.mock('../access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../access')>()),
  getFeeLockRouteContext: mocks.gate,
}));

const { GET } = await import('./route');
const WS = '00000000-0000-4000-8000-0000000fe010';
const STUDENT = '00000000-0000-4000-8000-0000000fe101';
const LOCK = '00000000-0000-4000-8000-0000000fe301';
const id = (n: number) => `00000000-0000-4000-8000-0000000fe${n}`;
const get = (query: string) =>
  GET(new Request(`https://finance.test/fee-locks/suggestion?${query}`), {
    params: Promise.resolve({ wsId: 'ws' }),
  });
const line = (extra: Record<string, unknown>) => ({
  kind: 'extra',
  group_id: null,
  group_name: null,
  label: 'Line',
  unit_label: null,
  product_id: null,
  unit_price: 0,
  quantity: 1,
  adjustment_amount: 0,
  reason: null,
  line_amount: 0,
  sort_order: 1,
  ...extra,
});
const snapshot = {
  schema_version: 1,
  fee_lock_id: LOCK,
  ws_id: WS,
  student_id: STUDENT,
  student_name: 'Synthetic student',
  period_month: '2026-12-01',
  currency: 'VND',
  revision: 2,
  total_amount: 1330000,
  note: null,
  locked_by: null,
  locked_at: '2026-11-25T03:00:00+00:00',
  lines: [
    line({
      kind: 'tuition',
      group_id: id(201),
      group_name: 'Class 1',
      label: 'Class 1',
      product_id: id(501),
      unit_id: id(405),
      warehouse_id: id(407),
      unit_price: 150000,
      quantity: 8,
      adjustment_amount: -100000,
      reason: 'Achievement',
      line_amount: 1100000,
    }),
    line({
      label: 'Book',
      product_id: id(502),
      unit_id: id(405),
      warehouse_id: id(407),
      unit_price: 90000,
      quantity: 2,
      line_amount: 180000,
      sort_order: 2,
    }),
    line({
      label: 'Sự kiện',
      unit_label: 'lần',
      unit_price: 50000,
      line_amount: 50000,
      sort_order: 3,
    }),
  ],
};
const allow = (db: ReturnType<typeof fakeSupabase>) =>
  mocks.gate.mockResolvedValue({
    context: { normalizedWsId: WS, sbAdmin: db.client },
  });

describe('GET /finance/fee-locks/suggestion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs create_invoices and view_invoices, and a valid student and month', async () => {
    mocks.gate.mockResolvedValue({
      response: new Response(null, { status: 403 }),
    });
    expect((await get(`studentId=${STUDENT}&month=2026-12`)).status).toBe(403);
    expect(mocks.gate).toHaveBeenCalledWith(expect.any(Request), 'ws', [
      'create_invoices',
      'view_invoices',
    ]);
    const db = fakeSupabase();
    allow(db);
    expect((await get('studentId=nope&month=2026-12')).status).toBe(400);
    expect(db.client.from).not.toHaveBeenCalled();
  });

  it('suggests nothing without a lock of this workspace, or for a draft', async () => {
    const none = fakeSupabase({ fee_locks: { data: null } });
    allow(none);
    expect(
      await (await get(`studentId=${STUDENT}&month=2026-12`)).json()
    ).toEqual({ suggestion: null });
    expect(
      none.filtered('fee_locks', 'ws_id', WS) &&
        none.filtered('fee_locks', 'period_month', '2026-12-01')
    ).toBe(true);
    const draft = fakeSupabase({
      fee_locks: { data: { id: LOCK, status: 'draft', revision: 2 } },
    });
    allow(draft);
    expect(
      await (await get(`studentId=${STUDENT}&month=2026-12`)).json()
    ).toEqual({ suggestion: null });
  });

  it('maps a locked fee to classes, catalogue products and an override without hand-added lines', async () => {
    expect(feeLockSnapshotSchema.safeParse(snapshot).success).toBe(true);
    const db = fakeSupabase({
      fee_locks: { data: { id: LOCK, status: 'locked', revision: 2 } },
      fee_lock_revisions: { data: { snapshot } },
    });
    allow(db);
    const { suggestion } = await (
      await get(`studentId=${STUDENT}&month=2026-12`)
    ).json();
    expect(suggestion).toMatchObject({
      fee_lock_id: LOCK,
      revision: 2,
      total_amount: 1330000,
      override_total: 1280000,
      group_ids: [id(201)],
      products: [
        {
          product_id: id(501),
          unit_id: id(405),
          warehouse_id: id(407),
          quantity: 8,
          group_id: id(201),
        },
        { product_id: id(502), quantity: 2, group_id: null },
      ],
      unmapped_lines: [
        {
          label: 'Sự kiện',
          unit_label: 'lần',
          quantity: 1,
          unit_price: 50000,
          line_amount: 50000,
        },
      ],
    });
    expect(
      db.filtered('fee_lock_revisions', 'ws_id', WS) &&
        db.filtered('fee_lock_revisions', 'revision', 2)
    ).toBe(true);
  });

  it('answers 500 without details for an unreadable snapshot', async () => {
    const db = fakeSupabase({
      fee_locks: { data: { id: LOCK, status: 'locked', revision: 2 } },
      fee_lock_revisions: { data: { snapshot: { schema_version: 9 } } },
    });
    allow(db);
    const response = await get(`studentId=${STUDENT}&month=2026-12`);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('schema_version');
  });
});
