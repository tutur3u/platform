import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from '../../fake-supabase.test-utils';

const mocks = vi.hoisted(() => ({ gate: vi.fn() }));
vi.mock('../../access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../access')>()),
  getFeeLockRouteContext: mocks.gate,
}));

const { POST } = await import('./route');
// Synthetic fixture ids only.
const WS = '00000000-0000-4000-8000-0000000fe010';
const LOCK = '00000000-0000-4000-8000-0000000fe301';
const template = {
  body: '{{centre_name}}: {{student_name}} {{tuition}}{{items_with_prefix}}. Tổng: {{total}}đ',
  item_format: '{{name}}: {{price}}đ/{{unit}}',
  item_separator: ', ',
  payment_line: '',
  notice_grouping: 'combined' as const,
  locale: 'vi' as const,
};
// biome-ignore format: compact fixture
const snapshot = (over: Record<string, unknown> = {}) => ({
  schema_version: 1, fee_lock_id: LOCK, ws_id: WS, student_id: '00000000-0000-4000-8000-0000000fe401',
  student_name: '<script>x</script>', period_month: '2026-12-01', currency: 'VND', revision: 2,
  total_amount: 800_000, note: null, locked_by: null, locked_at: '2026-11-25T10:00:00+07:00',
  lines: [
    { kind: 'tuition', group_id: null, group_name: 'Lớp A', label: 'Học phí', unit_label: 'buổi', product_id: null, unit_price: 100_000, quantity: 8, adjustment_amount: 0, reason: null, line_amount: 800_000, sort_order: 0 },
  ],
  ...over,
});
const allow = (tables: Parameters<typeof fakeSupabase>[0] = {}) => {
  const db = fakeSupabase({
    workspaces: { data: { name: 'Trung tâm X' } },
    ...tables,
  });
  mocks.gate.mockResolvedValue({
    context: { normalizedWsId: WS, sbAdmin: db.client },
  });
  return db;
};
const post = (body: unknown) =>
  POST(
    new Request('https://finance.test/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ wsId: 'ws' }) }
  );

describe('POST /finance/fee-locks/template/preview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs view_invoices and reads nothing when the gate refuses', async () => {
    const db = fakeSupabase();
    mocks.gate.mockResolvedValue({
      response: new Response(null, { status: 404 }),
    });
    expect((await post({})).status).toBe(404);
    expect(mocks.gate).toHaveBeenCalledWith(expect.any(Request), 'ws', [
      'view_invoices',
    ]);
    expect(db.client.from).not.toHaveBeenCalled();
  });

  it('rejects a bad body or an unknown placeholder before any read', async () => {
    const db = allow();
    expect((await post({ lockId: 'x' })).status).toBe(400);
    const response = await post({
      template: { ...template, body: '{{phone}}' },
    });
    expect(await response.json()).toMatchObject({
      code: 'FEE_NOTICE_TEMPLATE_INVALID',
    });
    expect(db.client.from).not.toHaveBeenCalled();
  });

  it('renders the built-in sample with the default template before any save', async () => {
    const db = allow({ fee_notice_templates: { data: [] } });
    const body = await (await post({})).json();
    expect(body).toMatchObject({ source: 'sample', template_version: null });
    expect(body.notices).toHaveLength(1);
    expect(body.notices[0].text).toContain(
      'Trung tâm X xin thông báo học phí tháng 12/2026 của Nguyễn Văn A'
    );
    expect(body.notices[0].text).toContain(
      'Lớp A: 800.000đ/8 buổi; Lớp B: 400.000đ/4 buổi, Sách: 150.000đ/bộ'
    );
    expect(db.filtered('workspaces', 'id', WS)).toBe(true);
  });

  it('renders a locked revision of the workspace as plain text, with an unsaved template', async () => {
    const db = allow({
      fee_locks: { data: { id: LOCK, revision: 2 } },
      fee_lock_revisions: { data: { snapshot: snapshot() } },
    });
    const body = await (await post({ lockId: LOCK, template })).json();
    expect(body).toMatchObject({ source: 'lock', template_version: null });
    expect(body.notices[0].text).toBe(
      'Trung tâm X: <script>x</script> 800.000đ/8 buổi. Tổng: 800.000đ'
    );
    for (const table of ['fee_locks', 'fee_lock_revisions']) {
      expect(db.filtered(table, 'ws_id', WS)).toBe(true);
    }
    expect(db.filtered('fee_lock_revisions', 'revision', 2)).toBe(true);
    expect(db.client.from).not.toHaveBeenCalledWith('fee_notice_templates');
  });

  it('answers 404 for another workspace, 400 for a never-locked fee, 500 for a foreign snapshot', async () => {
    const other = allow({ fee_locks: { data: null } });
    expect((await post({ lockId: LOCK })).status).toBe(404);
    expect(other.filtered('fee_locks', 'ws_id', WS)).toBe(true);
    allow({ fee_locks: { data: { id: LOCK, revision: 0 } } });
    expect((await post({ lockId: LOCK })).status).toBe(400);
    allow({
      fee_locks: { data: { id: LOCK, revision: 2 } },
      fee_lock_revisions: { data: { snapshot: snapshot({ ws_id: LOCK }) } },
    });
    expect((await post({ lockId: LOCK })).status).toBe(500);
  });
});
