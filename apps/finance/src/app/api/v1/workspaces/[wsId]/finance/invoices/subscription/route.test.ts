import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  getCalculatedInvoiceValuesFromRpc: vi.fn(),
  getFinanceRouteContext: vi.fn(),
  getPermissions: vi.fn(),
  getUser: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  validateInvoiceCustomer: vi.fn(),
  sbAdmin: {
    schema: vi.fn(() => ({})),
  },
  isGroupBlockedForSubscriptionInvoices: vi.fn(),
  isFeeLockEnabled: vi.fn(),
  sessionSupabase: {
    auth: {
      getUser: vi.fn(),
    },
  },
};

mocks.sessionSupabase.auth.getUser = mocks.getUser;

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve({})),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  getWorkspace: vi.fn(),
  getWorkspaceConfig: (...args: Parameters<typeof mocks.getWorkspaceConfig>) =>
    mocks.getWorkspaceConfig(...args),
  isPersonalWorkspace: vi.fn(),
}));

vi.mock('../route', () => ({
  getCalculatedInvoiceValuesFromRpc: (
    ...args: Parameters<typeof mocks.getCalculatedInvoiceValuesFromRpc>
  ) => mocks.getCalculatedInvoiceValuesFromRpc(...args),
  validateInvoiceCustomer: (
    ...args: Parameters<typeof mocks.validateInvoiceCustomer>
  ) => mocks.validateInvoiceCustomer(...args),
}));

vi.mock('@tuturuuu/finance-core/fee-lock/access', () => ({
  isFeeLockEnabled: (...args: Parameters<typeof mocks.isFeeLockEnabled>) =>
    mocks.isFeeLockEnabled(...args),
}));

vi.mock('@/utils/workspace-config', () => ({
  isGroupBlockedForSubscriptionInvoices: (
    ...args: Parameters<typeof mocks.isGroupBlockedForSubscriptionInvoices>
  ) => mocks.isGroupBlockedForSubscriptionInvoices(...args),
}));

describe('subscription invoice create route', () => {
  const withPermissions = (granted: string[]) => ({
    withoutPermission: vi.fn(
      (permission: string) => !granted.includes(permission)
    ),
  });

  function createBuilder<T>(result: T) {
    const builder = {
      delete: vi.fn(),
      eq: vi.fn(),
      filter: vi.fn(),
      in: vi.fn(),
      insert: vi.fn(),
      maybeSingle: vi.fn(),
      select: vi.fn(),
      single: vi.fn(),
    };
    const resultPromise = Promise.resolve(result);

    builder.delete.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.filter.mockReturnValue(builder);
    builder.in.mockReturnValue(builder);
    builder.insert.mockReturnValue(builder);
    builder.maybeSingle.mockResolvedValue(result);
    builder.select.mockReturnValue(builder);
    builder.single.mockResolvedValue(result);

    Object.defineProperty(builder, 'then', {
      value: resultPromise.then.bind(resultPromise),
    });

    return builder as typeof builder & PromiseLike<T>;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getWorkspaceConfig.mockResolvedValue(null);
    mocks.getPermissions.mockResolvedValue(
      withPermissions(['create_invoices'])
    );
    mocks.getFinanceRouteContext.mockImplementation(async () => ({
      context: {
        normalizedWsId: '00000000-0000-0000-0000-000000000000',
        permissions: await mocks.getPermissions(),
        sbAdmin: mocks.sbAdmin,
        supabase: {},
        user: {
          email: 'agent@example.com',
          id: 'user-1',
        },
      },
    }));
    mocks.isGroupBlockedForSubscriptionInvoices.mockResolvedValue(false);
    mocks.getCalculatedInvoiceValuesFromRpc.mockResolvedValue({
      subtotal: 100,
      discount_amount: 0,
      total: 100,
      values_recalculated: false,
      rounding_applied: 0,
      allowPromotions: true,
    });
    mocks.validateInvoiceCustomer.mockResolvedValue({
      customerId: 'customer-1',
      ok: true,
    });
    mocks.getUser.mockResolvedValue({
      data: {
        user: null,
      },
      error: null,
    });
  });

  it('resolves a missing invoice category from a single linked product category', async () => {
    const { resolveSubscriptionInvoiceCategoryId } = await import('./route');

    expect(
      resolveSubscriptionInvoiceCategoryId({
        linkedCategoryIds: ['category-1', 'category-1'],
        requestedCategoryId: undefined,
      })
    ).toEqual({ categoryId: 'category-1' });
  });

  it('requires a category override when linked product categories are mixed', async () => {
    const { resolveSubscriptionInvoiceCategoryId } = await import('./route');

    expect(
      resolveSubscriptionInvoiceCategoryId({
        linkedCategoryIds: ['category-1', 'category-2'],
        requestedCategoryId: undefined,
      })
    ).toEqual({
      error:
        'This cart contains products with different linked finance categories. Please choose a category override.',
    });
  });

  it('defaults subscription coverage to one month when prepaid count is omitted', async () => {
    const { resolveSubscriptionCoverageRange } = await import('./route');

    expect(
      resolveSubscriptionCoverageRange({
        selectedMonth: '2026-04',
      })
    ).toEqual({
      coverageEndMonth: '2026-04',
      prepaidMonthCount: 1,
      validUntil: new Date('2026-05-01T00:00:00.000Z'),
    });
  });

  it('rejects invalid prepaid month counts', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/finance/invoices/subscription',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer_id: 'customer-1',
            group_ids: ['group-1'],
            selected_month: '2026-04',
            prepaid_month_count: 13,
            content: 'Subscription invoice',
            wallet_id: 'wallet-1',
            category_id: 'category-1',
            products: [
              {
                product_id: 'product-1',
                unit_id: 'unit-1',
                warehouse_id: 'warehouse-1',
                quantity: 1,
                price: 100,
                category_id: 'category-1',
              },
            ],
          }),
        }
      ),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'prepaid_month_count must be an integer between 1 and 12',
    });
  });

  it('rejects non-default wallets on create without wallet override permissions', async () => {
    const { POST } = await import('./route');

    mocks.getWorkspaceConfig.mockResolvedValue('wallet-default');
    mocks.getPermissions.mockResolvedValue(
      withPermissions(['create_invoices'])
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/finance/invoices/subscription',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer_id: 'customer-1',
            group_ids: ['group-1'],
            selected_month: '2026-04',
            content: 'Subscription invoice',
            wallet_id: 'wallet-other',
            category_id: 'category-1',
            products: [
              {
                product_id: 'product-1',
                unit_id: 'unit-1',
                warehouse_id: 'warehouse-1',
                quantity: 1,
                price: 100,
                category_id: 'category-1',
              },
            ],
          }),
        }
      ),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message:
        'Insufficient permissions to override the default wallet for new invoices',
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('allows create-only wallet override permission for new subscription invoices', async () => {
    const { POST } = await import('./route');

    mocks.getWorkspaceConfig.mockResolvedValue('wallet-default');
    mocks.getPermissions.mockResolvedValue(
      withPermissions(['create_invoices', 'set_finance_wallets_on_create'])
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/finance/invoices/subscription',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer_id: 'customer-1',
            group_ids: ['group-1'],
            selected_month: '2026-04',
            content: 'Subscription invoice',
            wallet_id: 'wallet-other',
            category_id: 'category-1',
            products: [
              {
                product_id: 'product-1',
                unit_id: 'unit-1',
                warehouse_id: 'warehouse-1',
                quantity: 1,
                price: 100,
                category_id: 'category-1',
              },
            ],
          }),
        }
      ),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Internal server error',
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it.each(['local', 'foreign-wallet', 'foreign-group'])(
    'validates %s references while preserving subscription referral promotion creation',
    async (reference) => {
      const { POST } = await import('./route');

      const productValidationBuilder = createBuilder({
        data: [
          {
            finance_category_id: 'category-1',
            id: 'product-1',
          },
        ],
        error: null,
      });
      const categoryBuilder = createBuilder({
        data: {
          id: 'category-1',
        },
        error: null,
      });
      const actorBuilder = createBuilder({
        data: {
          virtual_user_id: 'actor-1',
        },
        error: null,
      });
      const invoiceBuilder = createBuilder({
        data: {
          id: 'invoice-1',
        },
        error: null,
      });
      const invoiceGroupsBuilder = createBuilder({
        data: null,
        error: null,
      });
      const productsDataBuilder = createBuilder({
        data: [
          {
            id: 'product-1',
            name: 'Course fee',
          },
        ],
        error: null,
      });
      const invoiceProductsBuilder = createBuilder({
        data: null,
        error: null,
      });
      const promotionBuilder = createBuilder({
        data: null,
        error: null,
      });
      const stockBuilder = createBuilder({
        data: null,
        error: null,
      });
      const unitsBuilder = createBuilder({
        data: [
          {
            id: 'unit-1',
            name: 'Month',
          },
        ],
        error: null,
      });

      const schemaClient = {
        from: vi.fn((table: string) =>
          table === 'workspace_wallets'
            ? createBuilder({
                data:
                  reference === 'foreign-wallet' ? null : { id: 'wallet-1' },
                error: null,
              })
            : unitsBuilder
        ),
      };
      const groupsBuilder = createBuilder({
        data: reference === 'foreign-group' ? [] : [{ id: 'group-1' }],
        error: null,
      });
      const sequentialFrom = vi
        .fn()
        .mockReturnValueOnce(productValidationBuilder)
        .mockReturnValueOnce(categoryBuilder)
        .mockReturnValueOnce(actorBuilder)
        .mockReturnValueOnce(invoiceBuilder)
        .mockReturnValueOnce(invoiceGroupsBuilder)
        .mockReturnValueOnce(productsDataBuilder)
        .mockReturnValueOnce(invoiceProductsBuilder)
        .mockReturnValueOnce(promotionBuilder)
        .mockReturnValueOnce(stockBuilder);
      const sbAdmin = {
        from: vi.fn((table: string) =>
          table === 'workspace_user_groups'
            ? groupsBuilder
            : sequentialFrom(table)
        ),
        schema: vi.fn(() => schemaClient),
      };

      mocks.getFinanceRouteContext.mockImplementation(async () => ({
        context: {
          normalizedWsId: '00000000-0000-0000-0000-000000000000',
          permissions: withPermissions(['create_invoices']),
          sbAdmin,
          supabase: {},
          user: {
            email: 'agent@example.com',
            id: 'platform-user-1',
          },
        },
      }));
      mocks.getCalculatedInvoiceValuesFromRpc.mockResolvedValue({
        allowPromotions: true,
        discount_amount: 15,
        promotion: {
          code: 'REF',
          description: 'Referral Code for Referral System',
          id: 'promo-referral-1',
          name: 'Referral',
          use_ratio: true,
          value: 15,
        },
        rounding_applied: 0,
        subtotal: 100,
        total: 85,
        values_recalculated: false,
      });

      const response = await POST(
        new Request(
          'http://localhost/api/v1/workspaces/ws-1/finance/invoices/subscription',
          {
            body: JSON.stringify({
              category_id: 'category-1',
              content: 'Subscription invoice',
              customer_id: 'customer-1',
              frontend_discount_amount: 15,
              frontend_subtotal: 100,
              frontend_total: 85,
              group_ids: ['group-1'],
              notes: '',
              products: [
                {
                  category_id: 'category-1',
                  price: 100,
                  product_id: 'product-1',
                  quantity: 1,
                  unit_id: 'unit-1',
                  warehouse_id: 'warehouse-1',
                },
              ],
              promotion_id: 'promo-referral-1',
              prepaid_month_count: 3,
              selected_month: '2026-04',
              wallet_id: 'wallet-1',
            }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          }
        ),
        {
          params: Promise.resolve({
            wsId: '00000000-0000-0000-0000-000000000000',
          }),
        }
      );

      if (reference !== 'local') {
        expect(response.status).toBe(400);
        expect(invoiceBuilder.insert).not.toHaveBeenCalled();
        return;
      }
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        data: {
          coverage_end_month: '2026-06',
          coverage_start_month: '2026-04',
          prepaid_month_count: 3,
          valid_until: '2026-07-01T00:00:00.000Z',
        },
      });
      expect(invoiceBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_months: ['2026-04-01', '2026-05-01', '2026-06-01'],
          valid_until: '2026-07-01T00:00:00.000Z',
        })
      );
      expect(promotionBuilder.insert).toHaveBeenCalledWith({
        code: 'REF',
        description: 'Referral Code for Referral System',
        invoice_id: 'invoice-1',
        name: 'Referral',
        promo_id: 'promo-referral-1',
        use_ratio: true,
        value: 15,
      });
      expect(schemaClient.from).toHaveBeenCalledWith('inventory_units');
    }
  );

  describe('fee_lock_ref', () => {
    const LOCK = '00000000-0000-4000-8000-0000000fe301';
    const WS = '00000000-0000-0000-0000-000000000000';
    // One builder per table; every insert is recorded in `inserts`.
    function sbAdminWith(tables: Record<string, unknown>) {
      const inserts: Array<{ table: string; row: unknown }> = [];
      const from = vi.fn((table: string) => {
        const builder = createBuilder(
          tables[table] ?? { data: null, error: null }
        );
        builder.insert.mockImplementation((row: unknown) => {
          inserts.push({ table, row });
          return builder;
        });
        return builder;
      });
      const rpc = vi.fn(async () => ({ data: true, error: null }));
      const schema = vi.fn(() => ({ from, rpc }));
      return { sbAdmin: { from, schema }, inserts, rpc };
    }
    const post = async (db: ReturnType<typeof sbAdminWith>) => {
      mocks.getFinanceRouteContext.mockImplementation(async () => ({
        context: {
          normalizedWsId: WS,
          permissions: withPermissions(['create_invoices']),
          sbAdmin: db.sbAdmin,
          supabase: {},
          user: { id: 'user-1' },
        },
      }));
      const { POST } = await import('./route');
      const body = {
        customer_id: 'customer-1',
        group_ids: ['group-1'],
        selected_month: '2026-12',
        content: 'Học phí',
        wallet_id: 'wallet-1',
        category_id: 'category-1',
        products: [
          {
            product_id: 'product-1',
            unit_id: 'unit-1',
            warehouse_id: 'warehouse-1',
            quantity: 8,
            price: 150000,
            category_id: 'category-1',
          },
        ],
        fee_lock_ref: { fee_lock_id: LOCK, revision: 2 },
      };
      return POST(
        new Request('http://localhost/x', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ wsId: WS }) }
      );
    };
    const reads = {
      workspace_wallets: { data: { id: 'wallet-1' }, error: null },
      workspace_user_groups: { data: [{ id: 'group-1' }], error: null },
      workspace_products: {
        data: [
          {
            id: 'product-1',
            name: 'Tuition',
            finance_category_id: 'category-1',
          },
        ],
        error: null,
      },
      transaction_categories: { data: { id: 'category-1' }, error: null },
      fee_locks: {
        data: {
          id: LOCK,
          student_id: 'customer-1',
          period_month: '2026-12-01',
          status: 'locked',
          revision: 2,
        },
        error: null,
      },
      fee_lock_revisions: {
        data: { revision: 2, total_amount: 100 },
        error: null,
      },
      inventory_units: { data: [{ id: 'unit-1', name: 'buổi' }], error: null },
    };

    it('answers 400 before any invoice is created when ENABLE_FEE_LOCK is off', async () => {
      mocks.isFeeLockEnabled.mockResolvedValue(false);
      const db = sbAdminWith(reads);
      const response = await post(db);
      expect([response.status, (await response.json()).code]).toEqual([
        400,
        'FEE_LOCK_DISABLED',
      ]);
      expect(mocks.isFeeLockEnabled).toHaveBeenCalledWith(WS);
      expect(db.inserts).toHaveLength(0);
    });

    it('links the invoice before stock changes and discards both in one RPC when stock fails', async () => {
      mocks.isFeeLockEnabled.mockResolvedValue(true);
      const db = sbAdminWith({
        ...reads,
        finance_invoices: { data: { id: 'invoice-1' }, error: null },
        product_stock_changes: {
          data: null,
          error: { message: 'stock failed' },
        },
      });
      const response = await post(db);
      expect(response.status).toBe(500);
      expect(db.inserts.map((insert) => insert.table)).toEqual([
        'finance_invoices',
        'finance_invoice_user_groups',
        'finance_invoice_products',
        'fee_lock_invoice_links',
        'fee_lock_events',
        'product_stock_changes',
      ]);
      expect(db.inserts[3]?.row).toMatchObject({
        ws_id: WS,
        invoice_id: 'invoice-1',
        fee_lock_id: LOCK,
        fee_lock_revision: 2,
        charged_total: 100,
      });
      expect(db.rpc).toHaveBeenCalledWith(
        'fee_lock_discard_new_invoice',
        expect.objectContaining({
          p_ws_id: WS,
          p_invoice_id: 'invoice-1',
          p_actor_id: 'user-1',
        })
      );
    });
  });
});
