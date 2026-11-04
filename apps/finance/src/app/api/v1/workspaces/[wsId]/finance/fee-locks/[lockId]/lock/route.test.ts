import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from '../../fake-supabase.test-utils';

const mocks = vi.hoisted(() => ({ gate: vi.fn() }));
vi.mock('../../access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../access')>()),
  getFeeLockRouteContext: mocks.gate,
}));

const { POST: lock } = await import('./route');
const { POST: reopen } = await import('../reopen/route');
const WS = '00000000-0000-4000-8000-0000000fe010';
const LOCK = '00000000-0000-4000-8000-0000000fe301';
const call = (handler: typeof lock, lockId: string, body: unknown) =>
  handler(
    new Request('https://finance.test/x', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    {
      params: Promise.resolve({ wsId: 'ws', lockId }),
    }
  );
const allow = (db: ReturnType<typeof fakeSupabase>) =>
  mocks.gate.mockResolvedValue({
    context: {
      normalizedWsId: WS,
      sbAdmin: db.client,
      user: { id: 'actor-1' },
    },
  });

describe('POST /finance/fee-locks/[lockId]/lock and /reopen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gates lock on create_invoices and reopen on update_invoices', async () => {
    mocks.gate.mockResolvedValue({
      response: new Response(null, { status: 403 }),
    });
    expect((await call(lock, LOCK, { expected_version: 1 })).status).toBe(403);
    expect(mocks.gate).toHaveBeenLastCalledWith(expect.any(Request), 'ws', [
      'create_invoices',
    ]);
    expect(
      (await call(reopen, LOCK, { expected_version: 1, reason: 'x' })).status
    ).toBe(403);
    expect(mocks.gate).toHaveBeenLastCalledWith(expect.any(Request), 'ws', [
      'update_invoices',
    ]);
  });

  it('rejects a malformed id, a missing version and a blank reason before any write', async () => {
    const db = fakeSupabase();
    allow(db);
    expect((await call(lock, 'nope', { expected_version: 1 })).status).toBe(
      404
    );
    expect((await call(lock, LOCK, {})).status).toBe(400);
    expect(
      (await call(reopen, LOCK, { expected_version: 1, reason: ' ' })).status
    ).toBe(400);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('passes the route workspace and actor, and maps a wrong status to 409', async () => {
    const db = fakeSupabase(
      {},
      {
        fee_lock_lock: { data: { id: LOCK, status: 'locked', revision: 1 } },
        fee_lock_reopen: {
          error: { code: '55000', message: 'FEE_LOCK_WRONG_STATUS' },
        },
      }
    );
    allow(db);
    expect(
      await (await call(lock, LOCK, { expected_version: 2 })).json()
    ).toMatchObject({ revision: 1 });
    expect(db.rpcCalls[0]).toEqual({
      fn: 'fee_lock_lock',
      args: {
        p_ws_id: WS,
        p_actor_id: 'actor-1',
        p_lock_id: LOCK,
        p_expected_version: 2,
      },
    });
    const wrong = await call(reopen, LOCK, {
      expected_version: 3,
      reason: 'Parent asked',
    });
    expect([wrong.status, (await wrong.json()).code]).toEqual([
      409,
      'FEE_LOCK_WRONG_STATUS',
    ]);
    expect(db.rpcCalls[1]?.args).toMatchObject({
      p_ws_id: WS,
      p_actor_id: 'actor-1',
      p_reason: 'Parent asked',
    });
  });
});
