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
    const { resolveSubscriptionInvoiceCategoryId } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/finance/invoices/subscription/route'
    );

    expect(
      resolveSubscriptionInvoiceCategoryId({
        linkedCategoryIds: ['category-1', 'category-1'],
        requestedCategoryId: undefined,
      })
    ).toEqual({ categoryId: 'category-1' });
  });

  it('requires a category override when linked product categories are mixed', async () => {
    const { resolveSubscriptionInvoiceCategoryId } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/finance/invoices/subscription/route'
    );

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
    const { resolveSubscriptionCoverageRange } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/finance/invoices/subscription/route'
    );

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
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/finance/invoices/subscription/route'
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
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/finance/invoices/subscription/route'
    );

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
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/finance/invoices/subscription/route'
    );

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

  it('records the calculated referral promotion value on created subscription invoices', async () => {
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/finance/invoices/subscription/route'
    );

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
      from: vi.fn(() => unitsBuilder),
    };
    const sbAdmin = {
      from: vi
        .fn()
        .mockReturnValueOnce(productValidationBuilder)
        .mockReturnValueOnce(categoryBuilder)
        .mockReturnValueOnce(actorBuilder)
        .mockReturnValueOnce(invoiceBuilder)
        .mockReturnValueOnce(invoiceGroupsBuilder)
        .mockReturnValueOnce(productsDataBuilder)
        .mockReturnValueOnce(invoiceProductsBuilder)
        .mockReturnValueOnce(promotionBuilder)
        .mockReturnValueOnce(stockBuilder),
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
  });
});
