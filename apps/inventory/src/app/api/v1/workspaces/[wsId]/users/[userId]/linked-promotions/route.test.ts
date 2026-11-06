import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.context,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(),
}));

import { DELETE } from './route';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let writes: string[];
const reads: string[] = [];
function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  let operation = '';
  const result = () => {
    if (operation) writes.push(`${table}:${operation}`);
    return { data: rows, error: null, count: rows.length };
  };
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => {
      rows = rows.filter((row) => row[key] === value);
      return q;
    },
    order: () => q,
    range: () => q,
    limit: () => q,
    insert: (row: Row) => {
      operation = 'insert';
      rows = [{ id: 'new', ...row }];
      return q;
    },
    update: () => {
      operation = 'update';
      return q;
    },
    delete: () => {
      operation = 'delete';
      return q;
    },
    maybeSingle: async () => ({ ...result(), data: rows[0] ?? null }),
    single: async () => ({ ...result(), data: rows[0] ?? null }),
    // biome-ignore lint/suspicious/noThenProperty: Supabase queries are awaitable.
    then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
      Promise.resolve(resolve(result())),
  };
  return q;
}
const client = {
  from: vi.fn((table: string) => {
    reads.push(table);
    return query(table);
  }),
  schema: (_name: string) => client,
};

function call(userId = 'user-a', promoId = 'promo-a') {
  return DELETE(
    new Request(`https://example.invalid/promotions?promoId=${promoId}`, {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ wsId: 'personal', userId }) }
  );
}
describe('inventory promotion unlink workspace scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes = [];
    reads.length = 0;
    tables = {
      workspace_users: [
        { id: 'user-a', ws_id: 'ws-a' },
        { id: 'user-b', ws_id: 'ws-b' },
      ],
      workspace_promotions: [
        { id: 'promo-a', ws_id: 'ws-a' },
        { id: 'promo-b', ws_id: 'ws-b' },
      ],
      user_linked_promotions: [
        { user_id: 'user-a', promo_id: 'promo-a' },
        { user_id: 'user-b', promo_id: 'promo-b' },
      ],
    };
    mocks.context.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-a',
        sbAdmin: client,
        permissions: { containsPermission: () => true },
      },
    });
  });
  it.each([
    ['user-b', 'promo-a'],
    ['user-a', 'promo-b'],
    ['user-b', 'promo-b'],
  ])('rejects a foreign user or promotion', async (user, promo) => {
    expect((await call(user, promo)).status).toBe(404);
    expect(writes).toEqual([]);
  });
  it('preserves authorized Finance forwarding with the normalized workspace', async () => {
    expect((await call()).status).toBe(200);
    expect(writes).toEqual(['user_linked_promotions:delete']);
  });
});
