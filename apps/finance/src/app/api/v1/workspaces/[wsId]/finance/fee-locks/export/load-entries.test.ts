import { describe, expect, it } from 'vitest';
import { fakeSupabase } from '../fake-supabase.test-utils';
import { loadFeeLockExportEntries } from './load-entries';

// Synthetic fixture ids only.
const WS = '00000000-0000-4000-8000-0000000fe010';
const OTHER_WS = '00000000-0000-4000-8000-0000000fe011';
const LOCKED = '00000000-0000-4000-8000-0000000fe301';
const DRAFT = '00000000-0000-4000-8000-0000000fe302';
const STUDENT = '00000000-0000-4000-8000-0000000fe401';
const GROUP = '00000000-0000-4000-8000-0000000fe501';

// biome-ignore format: compact fixtures
const snapshot = (over: Record<string, unknown> = {}) => ({
  schema_version: 1, fee_lock_id: LOCKED, ws_id: WS, student_id: '00000000-0000-4000-8000-0000000fe402',
  student_name: 'Học viên B', period_month: '2026-12-01', currency: 'VND', revision: 2, total_amount: 800_000,
  note: null, locked_by: null, locked_at: '2026-11-25T10:00:00+07:00',
  lines: [
    { kind: 'tuition', group_id: GROUP, group_name: 'Lớp A', label: 'Học phí', unit_label: 'buổi', product_id: null, unit_price: 100_000, quantity: 8, adjustment_amount: 0, reason: null, line_amount: 800_000, sort_order: 0 },
  ],
  ...over,
});

// biome-ignore format: compact fixtures
const tables = (over: Record<string, { data?: unknown; error?: unknown }> = {}) => ({
  workspace_user_groups: { data: { id: GROUP } },
  fee_locks: {
    data: [
      { id: LOCKED, student_id: 's1', status: 'locked', revision: 2, total_amount: 800_000 },
      { id: DRAFT, student_id: STUDENT, status: 'draft', revision: 0, total_amount: 150_000 },
    ],
  },
  fee_lock_revisions: { data: [{ id: 'r1', fee_lock_id: LOCKED, snapshot: snapshot() }] },
  fee_lock_lines: {
    data: [
      { id: 'l0', fee_lock_id: LOCKED, kind: 'tuition', group_id: GROUP },
      { id: 'l1', fee_lock_id: DRAFT, kind: 'extra', group_name_snapshot: null, label: 'Sách', unit_label: 'bộ', unit_price: 150_000, quantity: 1, adjustment_amount: 0, reason: null, line_amount: 150_000, sort_order: 0 },
    ],
  },
  workspace_users: { data: [{ id: STUDENT, full_name: 'Học viên A', display_name: null }] },
  ...over,
});

const load = (
  db: ReturnType<typeof fakeSupabase>,
  opts: { groupId?: string; status?: 'locked' | 'all' } = {}
) =>
  loadFeeLockExportEntries(db.client as never, WS, {
    periodMonth: '2026-12-01',
    status: 'locked',
    ...opts,
  });

describe('loadFeeLockExportEntries', () => {
  it('rejects a class of another workspace before reading any lock', async () => {
    const db = fakeSupabase(tables({ workspace_user_groups: { data: null } }));
    const { response } = await load(db, { groupId: GROUP });
    expect(response?.status).toBe(400);
    expect(db.filtered('workspace_user_groups', 'ws_id', WS)).toBe(true);
    expect(db.client.from).not.toHaveBeenCalledWith('fee_locks');
  });

  it('pages past max_rows and refuses more than 2000 rows', async () => {
    let page = 0;
    const db = fakeSupabase({
      fee_locks: {
        get data() {
          page += 1;
          return Array.from({ length: page < 3 ? 1000 : 1 }, (_, i) => ({
            id: `${page}-${i}`,
            status: 'locked',
          }));
        },
      },
    });
    const { response } = await load(db);
    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({
      code: 'FEE_LOCK_EXPORT_TOO_MANY',
      count: 2001,
    });
    expect(db.filtered('fee_locks', 'status', 'locked')).toBe(true);
  });

  it('reads snapshots for locks and live lines for drafts, ws-scoped, one entry per student', async () => {
    const db = fakeSupabase(tables());
    const { entries } = await load(db, { status: 'all', groupId: GROUP });
    expect(entries?.map(([id]) => id)).toEqual([DRAFT, LOCKED]);
    expect(entries?.[0]?.[1]).toMatchObject({
      status: 'draft',
      revision: null,
      student_name: 'Học viên A',
      total_amount: 150_000,
      lines: [{ kind: 'extra', label: 'Sách', group_name: null }],
    });
    expect(entries?.[1]?.[1]).toMatchObject({
      status: 'locked',
      revision: 2,
      student_name: 'Học viên B',
    });
    for (const table of [
      'fee_locks',
      'fee_lock_revisions',
      'fee_lock_lines',
      'workspace_users',
    ]) {
      expect(db.filtered(table, 'ws_id', WS)).toBe(true);
    }
    expect(db.filtered('fee_locks', 'period_month', '2026-12-01')).toBe(true);
    expect(db.filtered('fee_lock_revisions', 'revision', 2)).toBe(true);
    expect(db.filtered('fee_lock_lines', 'group_id', GROUP)).toBe(true);
    expect(db.filtered('fee_locks', 'status', 'locked')).toBe(false);
  });

  it('fails closed when a snapshot is foreign, mismatched or missing', async () => {
    for (const rows of [
      [
        {
          id: 'r1',
          fee_lock_id: LOCKED,
          snapshot: snapshot({ ws_id: OTHER_WS }),
        },
      ],
      [{ id: 'r1', fee_lock_id: LOCKED, snapshot: snapshot({ revision: 1 }) }],
      [{ id: 'r1', fee_lock_id: LOCKED, snapshot: { schema_version: 2 } }],
      [],
    ]) {
      const db = fakeSupabase(tables({ fee_lock_revisions: { data: rows } }));
      expect((await load(db)).response?.status).toBe(500);
    }
  });
});
