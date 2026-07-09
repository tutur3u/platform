import { beforeEach, describe, expect, it, vi } from 'vitest';

type MutationOperation = {
  filters: Array<{ column: string; value: unknown }>;
  mutation: 'delete' | 'update';
  payload?: unknown;
  schema: 'private' | 'public';
  table: string;
};

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  operations: [] as MutationOperation[],
  resolveFinanceRouteAuthContext: vi.fn(),
  serverError: vi.fn(),
}));

function createMutationBuilder(
  schema: MutationOperation['schema'],
  table: string,
  mutation: MutationOperation['mutation'],
  payload?: unknown
) {
  const operation: MutationOperation = {
    filters: [],
    mutation,
    payload,
    schema,
    table,
  };
  mocks.operations.push(operation);

  const builder = {
    eq: vi.fn((column: string, value: unknown) => {
      operation.filters.push({ column, value });
      return builder;
    }),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaited as thenables in route code.
    then: vi.fn((resolve, reject) =>
      Promise.resolve({ error: null }).then(resolve, reject)
    ),
  };

  return builder;
}

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.getFinanceRouteContext,
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: mocks.resolveFinanceRouteAuthContext,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: mocks.serverError,
  },
}));

describe('workspace promotion item route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.operations.length = 0;
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({
      user: { id: 'user-1' },
    });
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-1',
        permissions: {
          withoutPermission: vi.fn(() => false),
        },
        sbAdmin: {
          schema: (schema: 'private' | 'public') => ({
            from: (table: string) => ({
              delete: () => createMutationBuilder(schema, table, 'delete'),
              update: (payload: unknown) =>
                createMutationBuilder(schema, table, 'update', payload),
            }),
          }),
        },
      },
    });
  });

  it('binds promotion updates to the authorized workspace', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(
      new Request(
        'http://localhost/api/v1/workspaces/workspace-1/promotions/promotion-2',
        {
          body: JSON.stringify({
            code: 'SAVE',
            description: 'Scoped promotion',
            name: 'Save',
            unit: 'currency',
            value: 10,
          }),
          method: 'PUT',
        }
      ),
      {
        params: Promise.resolve({
          promotionId: 'promotion-2',
          wsId: 'workspace-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveFinanceRouteAuthContext).toHaveBeenCalledWith(
      expect.any(Request),
      {
        targetApp: ['finance', 'platform', 'inventory'],
      }
    );
    expect(mocks.operations).toEqual([
      expect.objectContaining({
        filters: [
          { column: 'id', value: 'promotion-2' },
          { column: 'ws_id', value: 'workspace-1' },
        ],
        mutation: 'update',
        schema: 'private',
        table: 'workspace_promotions',
      }),
    ]);
  });

  it('binds promotion deletion to the authorized workspace', async () => {
    const { DELETE } = await import('./route');
    const response = await DELETE(
      new Request(
        'http://localhost/api/v1/workspaces/workspace-1/promotions/promotion-2',
        { method: 'DELETE' }
      ),
      {
        params: Promise.resolve({
          promotionId: 'promotion-2',
          wsId: 'workspace-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveFinanceRouteAuthContext).toHaveBeenCalledWith(
      expect.any(Request),
      {
        targetApp: ['finance', 'platform', 'inventory'],
      }
    );
    expect(mocks.operations).toEqual([
      expect.objectContaining({
        filters: [
          { column: 'id', value: 'promotion-2' },
          { column: 'ws_id', value: 'workspace-1' },
        ],
        mutation: 'delete',
        schema: 'private',
        table: 'workspace_promotions',
      }),
    ]);
  });
});
