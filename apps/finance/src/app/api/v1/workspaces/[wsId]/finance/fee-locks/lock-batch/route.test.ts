import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from '../fake-supabase.test-utils';

const mocks = vi.hoisted(() => ({ gate: vi.fn() }));
vi.mock('../access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../access')>()),
  getFeeLockRouteContext: mocks.gate,
}));

const { POST } = await import('./route');
const WS = '00000000-0000-4000-8000-0000000fe010';
const id = (n: number) => `00000000-0000-4000-8000-0000000fe30${n}`;
const post = (body: unknown) =>
  POST(
    new Request('https://finance.test/x', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    {
      params: Promise.resolve({ wsId: 'ws' }),
    }
  );

describe('POST /finance/fee-locks/lock-batch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs create_invoices and a valid body of at most 200 items', async () => {
    mocks.gate.mockResolvedValue({
      response: new Response(null, { status: 403 }),
    });
    expect((await post({ month: '2026-12', items: [] })).status).toBe(403);
    expect(mocks.gate).toHaveBeenCalledWith(expect.any(Request), 'ws', [
      'create_invoices',
    ]);
    const db = fakeSupabase();
    mocks.gate.mockResolvedValue({
      context: {
        normalizedWsId: WS,
        sbAdmin: db.client,
        user: { id: 'actor-1' },
      },
    });
    const items = Array.from({ length: 201 }, () => ({
      id: id(1),
      expected_version: 1,
    }));
    expect((await post({ month: '2026-12', items })).status).toBe(400);
    expect(db.client.from).not.toHaveBeenCalled();
  });

  it('locks owned drafts, reports conflicts and never touches ids outside the workspace and month', async () => {
    const db = fakeSupabase({
      fee_locks: {
        data: [
          { id: id(1), version: 2 },
          { id: id(2), version: 5 },
        ],
      },
    });
    db.client.rpc
      .mockResolvedValueOnce({ data: { version: 3, revision: 1 }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PT409', details: '6' },
      });
    mocks.gate.mockResolvedValue({
      context: {
        normalizedWsId: WS,
        sbAdmin: db.client,
        user: { id: 'actor-1' },
      },
    });
    const response = await post({
      month: '2026-12',
      items: [
        { id: id(1), expected_version: 2 },
        { id: id(2), expected_version: 4 },
        { id: id(9), expected_version: 1 },
      ],
    });
    expect((await response.json()).results).toEqual([
      { id: id(1), result: 'ok', version: 3, revision: 1 },
      { id: id(2), result: 'conflict', current_version: 6 },
      { id: id(9), result: 'not_found' },
    ]);
    expect(
      db.filtered('fee_locks', 'ws_id', WS) &&
        db.filtered('fee_locks', 'period_month', '2026-12-01')
    ).toBe(true);
    expect(db.client.rpc).toHaveBeenCalledTimes(2);
    expect(db.client.rpc).toHaveBeenCalledWith('fee_lock_lock', {
      p_ws_id: WS,
      p_actor_id: 'actor-1',
      p_lock_id: id(1),
      p_expected_version: 2,
    });
  });

  it('stops with a 400 on an out-of-range amount and a 500 without the database message otherwise', async () => {
    const db = fakeSupabase({
      fee_locks: { data: [{ id: id(1), version: 1 }] },
    });
    mocks.gate.mockResolvedValue({
      context: {
        normalizedWsId: WS,
        sbAdmin: db.client,
        user: { id: 'actor-1' },
      },
    });
    db.client.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '22003', message: 'FEE_LOCK_AMOUNT_OUT_OF_RANGE' },
    });
    expect(
      (
        await post({
          month: '2026-12',
          items: [{ id: id(1), expected_version: 1 }],
        })
      ).status
    ).toBe(400);
    db.client.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'secret' },
    });
    const failed = await post({
      month: '2026-12',
      items: [{ id: id(1), expected_version: 1 }],
    });
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain('secret');
  });
});
