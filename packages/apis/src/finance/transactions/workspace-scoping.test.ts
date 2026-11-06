import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  write: vi.fn(),
  failureTable: null as string | null,
  failureSkip: 0,
  denied: vi.fn(() => false),
}));
vi.mock('../request-access', () => ({
  getFinanceRouteContext: mocks.access,
  hasAnyFinancePermission: () => true,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: vi.fn(async () => null),
}));
vi.mock('./transactionId/inventory-source', () => ({
  loadInventoryTransactionSource: vi.fn(async () => null),
}));

const wsId = '10000000-0000-4000-8000-000000000001';
const otherWsId = '10000000-0000-4000-8000-000000000002';
const walletId = '20000000-0000-4000-8000-000000000001';
const foreignWalletId = '20000000-0000-4000-8000-000000000002';
const categoryId = '30000000-0000-4000-8000-000000000001';
const foreignCategoryId = '30000000-0000-4000-8000-000000000002';
const transactionId = '40000000-0000-4000-8000-000000000001';

type Row = Record<string, unknown>;
const rows: Record<string, Row[]> = {
  workspace_wallets: [
    { id: walletId, ws_id: wsId, currency: 'USD' },
    { id: foreignWalletId, ws_id: otherWsId, currency: 'USD' },
  ],
  transaction_categories: [
    { id: categoryId, ws_id: wsId },
    { id: foreignCategoryId, ws_id: otherWsId },
  ],
  wallet_transactions: [{ id: transactionId, wallet_id: walletId }],
  workspace_user_linked_users: [],
};

// Apply the requested filters to synthetic rows so an unscoped lookup fails.
function from(table: string) {
  let matches = rows[table] ?? [];
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => {
      matches = matches.filter((row) => row[key] === value);
      return query;
    },
    maybeSingle: async () => {
      let error = null;
      if (mocks.failureTable === table) {
        if (mocks.failureSkip > 0) mocks.failureSkip -= 1;
        else error = { message: 'Lookup failed' };
      }
      return { data: matches[0] ?? null, error };
    },
    single: async () => ({ data: matches[0] ?? null, error: null }),
    insert: (payload: unknown) => {
      mocks.write(payload);
      return {
        select: () => ({
          single: async () => ({
            data: { id: transactionId },
            error: null,
          }),
        }),
      };
    },
    update: (payload: unknown) => {
      mocks.write(payload);
      return { eq: async () => ({ error: null }) };
    },
  };
  return query;
}

describe('transaction workspace references', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.denied.mockReturnValue(false);
    mocks.failureTable = null;
    mocks.failureSkip = 0;
    const client = {
      from,
      schema: () => ({ from }),
      rpc: async () => ({ data: null, error: null }),
    };
    mocks.access.mockResolvedValue({
      context: {
        normalizedWsId: wsId,
        permissions: {
          wsId,
          withoutPermission: mocks.denied,
          containsPermission: () => true,
        },
        sbAdmin: client,
        supabase: client,
        user: { id: 'actor' },
      },
    });
  });

  for (const method of ['POST', 'PUT'] as const) {
    for (const [field, value] of [
      ['category_id', foreignCategoryId],
      ['origin_wallet_id', foreignWalletId],
    ] as const) {
      it(`${method} rejects foreign ${field} with 403 before writing`, async () => {
        const handler =
          method === 'POST'
            ? (await import('./route.js')).POST
            : (await import('./transactionId/route.js')).PUT;
        const response = await handler(
          new Request('http://localhost/transactions', {
            method,
            body: JSON.stringify({
              amount: 12,
              taken_at: '2026-10-01T00:00:00Z',
              origin_wallet_id: walletId,
              [field]: value,
            }),
          }),
          { params: Promise.resolve({ wsId: 'personal', transactionId }) }
        );
        expect(response.status).toBe(403);
        expect(mocks.write).not.toHaveBeenCalled();
      });
    }

    for (const table of ['workspace_wallets', 'transaction_categories']) {
      it(`${method} returns 500 for a failed ${table} lookup without writing`, async () => {
        mocks.failureTable = table;
        // PUT first verifies the existing wallet, then checks the requested wallet.
        mocks.failureSkip =
          method === 'PUT' && table === 'workspace_wallets' ? 1 : 0;
        const handler =
          method === 'POST'
            ? (await import('./route.js')).POST
            : (await import('./transactionId/route.js')).PUT;
        const response = await handler(
          new Request('http://localhost/transactions', {
            method,
            body: JSON.stringify({
              amount: 12,
              taken_at: '2026-10-01T00:00:00Z',
              origin_wallet_id: walletId,
              category_id: categoryId,
            }),
          }),
          { params: Promise.resolve({ wsId, transactionId }) }
        );
        expect(response.status).toBe(500);
        expect(mocks.write).not.toHaveBeenCalled();
      });
    }

    for (const category of [null, undefined]) {
      it(`${method} preserves ${category === null ? 'null category rejection' : 'an omitted category'}`, async () => {
        const handler =
          method === 'POST'
            ? (await import('./route.js')).POST
            : (await import('./transactionId/route.js')).PUT;
        const response = await handler(
          new Request('http://localhost/transactions', {
            method,
            body: JSON.stringify({
              amount: 12,
              taken_at: '2026-10-01T00:00:00Z',
              origin_wallet_id: walletId,
              category_id: category,
            }),
          }),
          { params: Promise.resolve({ wsId, transactionId }) }
        );
        if (category === null) {
          expect(response.status).toBe(400);
          expect(mocks.write).not.toHaveBeenCalled();
          return;
        }
        expect(response.status).toBe(200);
        if (method === 'PUT') {
          expect(mocks.write.mock.calls[0]?.[0]).not.toHaveProperty(
            'category_id'
          );
        } else {
          expect(mocks.write).toHaveBeenCalledWith(
            expect.objectContaining({ category_id: null })
          );
        }
      });
    }

    it(`${method} denies a member without the action permission before an admin write`, async () => {
      mocks.denied.mockReturnValue(true);
      const handler =
        method === 'POST'
          ? (await import('./route.js')).POST
          : (await import('./transactionId/route.js')).PUT;
      const response = await handler(
        new Request('http://localhost/transactions', {
          method,
          body: JSON.stringify({
            amount: 12,
            taken_at: '2026-10-01T00:00:00Z',
            origin_wallet_id: walletId,
          }),
        }),
        { params: Promise.resolve({ wsId, transactionId }) }
      );
      expect(response.status).toBe(403);
      expect(mocks.write).not.toHaveBeenCalled();
    });

    it(`${method} accepts references in the normalized workspace`, async () => {
      const handler =
        method === 'POST'
          ? (await import('./route.js')).POST
          : (await import('./transactionId/route.js')).PUT;
      const response = await handler(
        new Request('http://localhost/transactions', {
          method,
          body: JSON.stringify({
            amount: 12,
            taken_at: '2026-10-01T00:00:00Z',
            origin_wallet_id: walletId,
            category_id: categoryId,
          }),
        }),
        { params: Promise.resolve({ wsId: 'personal', transactionId }) }
      );
      expect(response.status).toBe(200);
      expect(mocks.write).toHaveBeenCalledWith(
        expect.objectContaining({
          category_id: categoryId,
          wallet_id: walletId,
        })
      );
    });
  }
});
