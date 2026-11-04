import { XLSX } from '@tuturuuu/ui/xlsx';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeeLockExportEntry } from '@/lib/fee-lock/export-rows';
import { sha256Hex } from '@/lib/fee-lock/export-workbook';
import { fakeSupabase } from '../fake-supabase.test-utils';

const mocks = vi.hoisted(() => ({ gate: vi.fn(), load: vi.fn() }));
vi.mock('../access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../access')>()),
  getFeeLockRouteContext: mocks.gate,
}));
vi.mock('./load-entries', () => ({ loadFeeLockExportEntries: mocks.load }));

const { POST } = await import('./route');
// Synthetic fixture ids only.
const WS = '00000000-0000-4000-8000-0000000fe010';
const ACTOR = '00000000-0000-4000-8000-0000000fe0a1';
const LOCKED = '00000000-0000-4000-8000-0000000fe301';
const DRAFT = '00000000-0000-4000-8000-0000000fe302';
const GROUP = '00000000-0000-4000-8000-0000000fe501';

const entry = (over: Partial<FeeLockExportEntry>): FeeLockExportEntry => ({
  status: 'locked',
  revision: 2,
  student_name: 'Học viên B',
  period_month: '2026-12-01',
  total_amount: 800_000,
  lines: [],
  ...over,
});
// biome-ignore format: compact fixture
const ENTRIES: Array<[string, FeeLockExportEntry]> = [
  [DRAFT, entry({ status: 'draft', revision: null, student_name: '=HYPERLINK("https://evil.test")' })],
  [LOCKED, entry({})],
];

const post = (body: unknown) =>
  POST(
    new Request('https://finance.test/fee-locks/export', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ wsId: 'ws' }) }
  );
const allow = (tables: Parameters<typeof fakeSupabase>[0] = {}) => {
  const db = fakeSupabase(tables);
  mocks.gate.mockResolvedValue({
    context: { normalizedWsId: WS, sbAdmin: db.client, user: { id: ACTOR } },
  });
  return db;
};
const inserted = (db: ReturnType<typeof fakeSupabase>) =>
  db.calls.find((c) => c.table === 'fee_lock_events' && c.method === 'insert')
    ?.args[0] as Record<string, any> | undefined;

describe('POST /finance/fee-locks/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({ entries: ENTRIES });
  });

  it('needs view_invoices AND export_finance_data and reads nothing otherwise', async () => {
    mocks.gate.mockResolvedValue({
      response: new Response(null, { status: 404 }),
    });
    expect((await post({ month: '2026-12' })).status).toBe(404);
    expect(mocks.gate).toHaveBeenCalledWith(expect.any(Request), 'ws', [
      'view_invoices',
      'export_finance_data',
    ]);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('rejects a bad body and passes a loader refusal through without an event', async () => {
    const db = allow();
    expect((await post({ month: '2026-13' })).status).toBe(400);
    expect((await post({ month: '2026-12', status: 'none' })).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
    mocks.load.mockResolvedValue({
      response: NextResponse.json(
        { code: 'FEE_LOCK_EXPORT_TOO_MANY' },
        { status: 400 }
      ),
    });
    expect((await post({ month: '2026-12' })).status).toBe(400);
    expect(inserted(db)).toBeUndefined();
  });

  it('streams the workbook and logs an exported event with the digest of those bytes', async () => {
    const db = allow();
    const response = await post({
      month: '2026-12',
      status: 'all',
      groupId: GROUP,
    });
    expect(mocks.load).toHaveBeenCalledWith(db.client, WS, {
      periodMonth: '2026-12-01',
      groupId: GROUP,
      status: 'all',
    });
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'content-type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // No user text in the name: validated month + 8 hex digits of the ws id.
      'content-disposition':
        'attachment; filename="chot-hoc-phi-2026-12-00000000.xlsx"',
      'cache-control': 'no-store',
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sheet = XLSX.read(bytes, { type: 'array' }).Sheets['Tổng hợp'];
    expect(sheet?.B2).toMatchObject({
      t: 's',
      v: `'=HYPERLINK("https://evil.test")`,
    });
    expect(sheet?.B3?.v).toBe('Học viên B');
    const event = inserted(db);
    expect(event).toMatchObject({
      ws_id: WS,
      event_type: 'exported',
      actor_id: ACTOR,
    });
    expect(event?.metadata).toEqual({
      ws_id: WS,
      period: '2026-12',
      status_filter: 'all',
      group_id: GROUP,
      locale: 'vi',
      sort: 'student_name:vi,fee_lock_id',
      include_notice: false,
      row_count: 2,
      sha256: await sha256Hex(bytes),
      template_version: null,
      revisions_count: 1,
      revisions_sha256: await sha256Hex(
        new TextEncoder().encode(JSON.stringify([[LOCKED, 2]]))
      ),
      revisions: [[LOCKED, 2]],
    });
    expect(JSON.stringify(event)).not.toMatch(/Học viên|HYPERLINK/);
  });

  it('keeps metadata under 8 KB, always with the request, so a cut list can be replayed', async () => {
    const many = Array.from(
      { length: 200 },
      (_, i): [string, FeeLockExportEntry] => [
        `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        entry({}),
      ]
    );
    mocks.load.mockResolvedValue({ entries: many });
    const db = allow();
    expect((await post({ month: '2026-12', locale: 'en' })).status).toBe(200);
    const metadata = inserted(db)?.metadata;
    expect(metadata).toMatchObject({
      ws_id: WS,
      period: '2026-12',
      status_filter: 'locked',
      group_id: null,
      locale: 'en',
      sort: 'student_name:vi,fee_lock_id',
      row_count: 200,
      revisions_count: 200,
    });
    expect(metadata).not.toHaveProperty('revisions');
    expect(JSON.stringify(metadata).length).toBeLessThan(8192);
    // Replaying the logged request (same loader order) reproduces the digest.
    expect(metadata.revisions_sha256).toBe(
      await sha256Hex(
        new TextEncoder().encode(JSON.stringify(many.map(([id]) => [id, 2])))
      )
    );
    expect(mocks.load).toHaveBeenCalledWith(db.client, WS, {
      periodMonth: '2026-12-01',
      groupId: undefined,
      status: 'locked',
    });
  });

  it('sends no file when the exported event cannot be written', async () => {
    allow({ fee_lock_events: { error: { code: 'XX000' } } });
    const response = await post({ month: '2026-12' });
    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).not.toContain('spreadsheet');
  });
});
