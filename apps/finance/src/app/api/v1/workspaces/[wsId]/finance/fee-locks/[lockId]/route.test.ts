import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase } from '../fake-supabase.test-utils';

const mocks = vi.hoisted(() => ({ gate: vi.fn() }));
vi.mock('../access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../access')>()),
  getFeeLockRouteContext: mocks.gate,
}));

const { GET } = await import('./route');
const WS = '00000000-0000-4000-8000-0000000fe010';
const LOCK = '00000000-0000-4000-8000-0000000fe301';
const get = (lockId: string) =>
  GET(new Request('https://finance.test/fee-locks/x'), {
    params: Promise.resolve({ wsId: 'ws', lockId }),
  });

describe('GET /finance/fee-locks/[lockId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the gate response and reads nothing', async () => {
    const db = fakeSupabase();
    mocks.gate.mockResolvedValue({
      response: new Response(null, { status: 403 }),
    });
    expect((await get(LOCK)).status).toBe(403);
    expect(mocks.gate).toHaveBeenCalledWith(expect.any(Request), 'ws', [
      'view_invoices',
    ]);
    expect(db.client.from).not.toHaveBeenCalled();
  });

  it('answers 404 for a malformed id or a lock of another workspace', async () => {
    const db = fakeSupabase({ fee_locks: { data: null } });
    mocks.gate.mockResolvedValue({
      context: { normalizedWsId: WS, sbAdmin: db.client },
    });
    expect((await get('not-a-uuid')).status).toBe(404);
    expect(db.client.from).not.toHaveBeenCalled();
    expect((await get(LOCK)).status).toBe(404);
    expect(
      db.filtered('fee_locks', 'ws_id', WS) &&
        db.filtered('fee_locks', 'id', LOCK)
    ).toBe(true);
  });

  it('returns the header, lines and revisions scoped to the workspace', async () => {
    const db = fakeSupabase({
      fee_locks: {
        data: {
          id: LOCK,
          ws_id: WS,
          status: 'locked',
          revision: 1,
          version: 3,
        },
      },
      fee_lock_lines: {
        data: [{ id: 'line-1', kind: 'tuition', line_amount: 1200000 }],
      },
      fee_lock_revisions: {
        data: [
          {
            revision: 1,
            total_amount: 1200000,
            locked_by: null,
            locked_at: 't',
          },
        ],
      },
    });
    mocks.gate.mockResolvedValue({
      context: { normalizedWsId: WS, sbAdmin: db.client },
    });
    const response = await get(LOCK);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      lock: { id: LOCK, version: 3 },
      lines: [{ id: 'line-1' }],
      revisions: [{ revision: 1 }],
    });
    expect(
      db.filtered('fee_lock_lines', 'ws_id', WS) &&
        db.filtered('fee_lock_revisions', 'ws_id', WS)
    ).toBe(true);
  });
});
