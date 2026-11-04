import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from './fake-supabase.test-utils';

const mocks = vi.hoisted(() => ({ gate: vi.fn() }));
vi.mock('./access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./access')>()),
  getFeeLockRouteContext: mocks.gate,
  getFeeLockCurrency: async () => 'VND',
}));

const { GET, foldFeeLockSearchText } = await import('./route');
const WS = '00000000-0000-4000-8000-0000000fe010';
const GROUP = '00000000-0000-4000-8000-0000000fe201';
const params = { params: Promise.resolve({ wsId: 'personal' }) };
const get = (query: string) =>
  GET(new Request(`https://finance.test/fee-locks?${query}`), params);
const cls = (student: string, name: string, n: number) => ({
  student_id: student,
  student_name: name,
  group_id: GROUP,
  group_name: 'Class 1',
  product_id: null,
  unit_id: null,
  warehouse_id: null,
  unit_price: 150000,
  session_count: n,
  baseline_amount: 150000 * n,
});

function allow(db: ReturnType<typeof fakeSupabase>) {
  mocks.gate.mockResolvedValue({
    context: { normalizedWsId: WS, sbAdmin: db.client },
  });
}

describe('GET /finance/fee-locks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the gate response and reads nothing', async () => {
    const db = fakeSupabase();
    mocks.gate.mockResolvedValue({
      response: new Response(null, { status: 404 }),
    });
    expect((await get('month=2026-12')).status).toBe(404);
    expect(mocks.gate).toHaveBeenCalledWith(expect.any(Request), 'personal', [
      'view_invoices',
    ]);
    expect(db.client.from).not.toHaveBeenCalled();
  });

  it('rejects a bad month and a class from another workspace with 400', async () => {
    const db = fakeSupabase({ workspace_user_groups: { data: null } });
    allow(db);
    expect((await get('month=2026-13')).status).toBe(400);
    expect((await get(`month=2026-12&groupId=${GROUP}`)).status).toBe(400);
    expect(db.filtered('workspace_user_groups', 'ws_id', WS)).toBe(true);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('merges the baseline with locks, filters and pages in the workspace', async () => {
    const db = fakeSupabase(
      {
        fee_locks: {
          data: [
            {
              id: 'lock-a',
              student_id: 'a',
              status: 'locked',
              revision: 2,
              version: 4,
              total_amount: 1200000,
              updated_at: 't',
              updated_by: 'u1',
            },
            {
              id: 'lock-c',
              student_id: 'c',
              status: 'draft',
              revision: 0,
              version: 1,
              total_amount: 0,
              updated_at: 't',
              updated_by: null,
            },
          ],
        },
        workspace_users: {
          data: [{ id: 'c', full_name: 'Cao Left Class', display_name: null }],
        },
        users: { data: [{ id: 'u1', display_name: 'Staff' }] },
      },
      {
        fee_lock_baseline: {
          data: [cls('a', 'Nguyễn An', 8), cls('b', 'Bùi Bình', 4)],
        },
      }
    );
    allow(db);
    const all = await (await get('month=2026-12')).json();
    expect(all.count).toBe(3);
    expect(all.currency).toBe('VND');
    expect(all.data.map((r: { student_id: string }) => r.student_id)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(all.data[2]).toMatchObject({
      baseline_total: 1200000,
      lock: { id: 'lock-a', updated_by_name: 'Staff' },
    });
    expect(db.rpcCalls[0]).toEqual({
      fn: 'fee_lock_baseline',
      args: { p_ws_id: WS, p_month: '2026-12-01', p_currency: 'VND' },
    });
    expect(
      db.filtered('fee_locks', 'ws_id', WS) &&
        db.filtered('workspace_users', 'ws_id', WS)
    ).toBe(true);

    const locked = await (
      await get('month=2026-12&status=locked&q=nguyen')
    ).json();
    expect(
      locked.data.map((r: { student_id: string }) => r.student_id)
    ).toEqual(['a']);
    const none = await (
      await get('month=2026-12&status=none&pageSize=1')
    ).json();
    expect([none.count, none.data[0].student_id]).toEqual([1, 'b']);
  });

  it('folds Vietnamese accents for search', () => {
    expect(foldFeeLockSearchText('Đặng Thị Ánh')).toBe('dang thi anh');
  });
});
