import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from '../../fee-locks/fake-supabase.test-utils';

const mocks = vi.hoisted(() => ({ enabled: vi.fn() }));
vi.mock('@tuturuuu/finance-core/fee-lock/access', () => ({
  isFeeLockEnabled: mocks.enabled,
}));

const { discardNewSubscriptionInvoice, insertFeeLockLink, resolveFeeLockRef } =
  await import('./fee-lock-link');

const WS = '00000000-0000-4000-8000-0000000fe010';
const LOCK = '00000000-0000-4000-8000-0000000fe301';
const STUDENT = '00000000-0000-4000-8000-0000000fe101';
const INVOICE = '00000000-0000-4000-8000-0000000fe851';
type Db = ReturnType<typeof fakeSupabase>;
const client = (db: Db) => db.client as never;
const resolve = (db: Db, ref: unknown, customerId = STUDENT) =>
  resolveFeeLockRef(client(db), {
    wsId: WS,
    ref,
    customerId,
    selectedMonth: '2026-12',
  });
const lockRow = (status = 'locked', revision = 2) => ({
  data: {
    id: LOCK,
    student_id: STUDENT,
    period_month: '2026-12-01',
    status,
    revision,
  },
});
const link = {
  fee_lock_id: LOCK,
  revision: 2,
  suggested_total: 1200000,
  stale: false,
};

describe('resolveFeeLockRef', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockResolvedValue(true);
  });

  it('ignores a missing ref without any read and refuses a ref while the flag is off', async () => {
    const db = fakeSupabase();
    expect(await resolve(db, undefined)).toBeNull();
    expect(mocks.enabled).not.toHaveBeenCalled();
    mocks.enabled.mockResolvedValue(false);
    const off = (await resolve(db, {
      fee_lock_id: LOCK,
      revision: 2,
    })) as Response;
    expect([off.status, (await off.json()).code]).toEqual([
      400,
      'FEE_LOCK_DISABLED',
    ]);
    expect(mocks.enabled).toHaveBeenCalledWith(WS);
    expect(db.client.from).not.toHaveBeenCalled();
  });

  it('rejects a malformed ref and one of another workspace, student or month', async () => {
    expect(
      (
        (await resolve(fakeSupabase(), {
          fee_lock_id: LOCK,
          revision: 2,
          ws_id: 'x',
        })) as Response
      ).status
    ).toBe(400);
    const missing = fakeSupabase({ fee_locks: { data: null } });
    const notFound = (await resolve(missing, {
      fee_lock_id: LOCK,
      revision: 2,
    })) as Response;
    expect((await notFound.json()).code).toBe('FEE_LOCK_REF_MISMATCH');
    expect(
      missing.filtered('fee_locks', 'ws_id', WS) &&
        missing.filtered('fee_locks', 'id', LOCK)
    ).toBe(true);
    const other = fakeSupabase({
      fee_locks: lockRow(),
      fee_lock_revisions: { data: { revision: 2, total_amount: 1200000 } },
    });
    expect(
      (
        (await resolve(
          other,
          { fee_lock_id: LOCK, revision: 2 },
          'another-student'
        )) as Response
      ).status
    ).toBe(400);
  });

  it('refuses an already invoiced revision and an out-of-range total', async () => {
    const used = fakeSupabase({
      fee_locks: lockRow(),
      fee_lock_revisions: { data: { revision: 2, total_amount: 1200000 } },
      fee_lock_invoice_links: { data: { id: 'link-1' } },
    });
    expect(
      ((await resolve(used, { fee_lock_id: LOCK, revision: 2 })) as Response)
        .status
    ).toBe(409);
    expect(used.filtered('fee_lock_invoice_links', 'ws_id', WS)).toBe(true);
    const huge = fakeSupabase({
      fee_locks: lockRow(),
      fee_lock_revisions: { data: { revision: 2, total_amount: 1e15 } },
    });
    expect(
      ((await resolve(huge, { fee_lock_id: LOCK, revision: 2 })) as Response)
        .status
    ).toBe(400);
  });

  it('returns the link and marks a reopened or relocked fee as stale', async () => {
    const tables = (status: string, revision: number) =>
      fakeSupabase({
        fee_locks: lockRow(status, revision),
        fee_lock_revisions: { data: { revision: 2, total_amount: 1200000 } },
      });
    expect(
      await resolve(tables('locked', 2), { fee_lock_id: LOCK, revision: 2 })
    ).toEqual(link);
    expect(
      await resolve(tables('draft', 2), { fee_lock_id: LOCK, revision: 2 })
    ).toMatchObject({ stale: true });
    expect(
      await resolve(tables('locked', 3), { fee_lock_id: LOCK, revision: 2 })
    ).toMatchObject({ stale: true });
  });
});

describe('insertFeeLockLink', () => {
  const insert = (db: Db, chargedTotal = 1100000) =>
    insertFeeLockLink(client(db), {
      wsId: WS,
      invoiceId: INVOICE,
      link,
      chargedTotal,
      actorId: 'actor-1',
    });
  const inserted = (db: Db, table: string) =>
    db.calls.find((call) => call.table === table && call.method === 'insert')
      ?.args[0];

  it('writes the link and an invoice_linked event with ids, actor and totals only', async () => {
    const db = fakeSupabase();
    expect(await insert(db)).toBeNull();
    expect(inserted(db, 'fee_lock_invoice_links')).toEqual({
      ws_id: WS,
      invoice_id: INVOICE,
      fee_lock_id: LOCK,
      fee_lock_revision: 2,
      suggested_total: 1200000,
      charged_total: 1100000,
      created_by: 'actor-1',
    });
    expect(inserted(db, 'fee_lock_events')).toMatchObject({
      ws_id: WS,
      fee_lock_id: LOCK,
      event_type: 'invoice_linked',
      actor_id: 'actor-1',
      metadata: { invoice_id: INVOICE, stale: false },
    });
  });

  it('answers 409 for a revision taken meanwhile, 500 when the event fails, 400 out of range', async () => {
    expect(
      (
        await insert(
          fakeSupabase({ fee_lock_invoice_links: { error: { code: '23505' } } })
        )
      )?.status
    ).toBe(409);
    expect(
      (
        await insert(
          fakeSupabase({ fee_lock_events: { error: { code: 'XX000' } } })
        )
      )?.status
    ).toBe(500);
    const db = fakeSupabase();
    expect((await insert(db, 1e15))?.status).toBe(400);
    expect(db.client.from).not.toHaveBeenCalled();
  });
});

describe('discardNewSubscriptionInvoice', () => {
  const started = new Date('2026-12-01T03:00:00Z');

  it('discards a linked invoice through the one-transaction RPC with the request start', async () => {
    const db = fakeSupabase(
      {},
      { fee_lock_discard_new_invoice: { data: true } }
    );
    await discardNewSubscriptionInvoice(client(db), {
      wsId: WS,
      invoiceId: INVOICE,
      actorId: 'actor-1',
      requestStartedAt: started,
      linked: true,
    });
    expect(db.rpcCalls).toEqual([
      {
        fn: 'fee_lock_discard_new_invoice',
        args: {
          p_ws_id: WS,
          p_invoice_id: INVOICE,
          p_actor_id: 'actor-1',
          p_request_started_at: '2026-12-01T02:58:00.000Z',
          p_reason: 'Subscription invoice creation failed',
        },
      },
    ]);
    expect(db.client.from).not.toHaveBeenCalled();
  });

  it('keeps the original child-first cleanup for an unlinked invoice and does nothing without one', async () => {
    const db = fakeSupabase();
    await discardNewSubscriptionInvoice(client(db), {
      wsId: WS,
      invoiceId: null,
      actorId: 'a',
      requestStartedAt: started,
      linked: true,
    });
    expect(db.rpcCalls).toHaveLength(0);
    await discardNewSubscriptionInvoice(client(db), {
      wsId: WS,
      invoiceId: INVOICE,
      actorId: 'a',
      requestStartedAt: started,
      linked: false,
    });
    expect(
      db.calls.filter((c) => c.method === 'delete').map((c) => c.table)
    ).toEqual([
      'finance_invoice_promotions',
      'finance_invoice_products',
      'finance_invoice_user_groups',
      'finance_invoices',
    ]);
  });
});
