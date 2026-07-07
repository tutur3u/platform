import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionInvoice } from './subscription-invoice';

const testState = vi.hoisted(() => {
  const inventory = {
    amount: 5,
    min_amount: 1,
    price: 100,
    unit_id: 'unit-1',
    unit_name: 'Seat',
    warehouse_id: 'warehouse-1',
    warehouse_name: 'Main',
  };
  const product = {
    category: null,
    category_id: 'inventory-category',
    created_at: null,
    description: null,
    finance_category_id: null as string | null,
    id: 'product-1',
    inventory: [inventory],
    manufacturer: null,
    name: 'Subscription seat',
    usage: null,
    ws_id: 'ws-1',
  };

  return {
    InvoicePaymentSettings: vi.fn(),
    categories: [] as Array<{ id: string; name: string }>,
    groupIds: ['group-1'],
    month: '2026-07',
    productSelectionInjected: false,
    products: [product],
    selectedProducts: [{ inventory, product, quantity: 1 }],
    useCategories: vi.fn(),
    useWallets: vi.fn(),
    userId: 'user-1',
    wallets: [] as Array<{
      currency: string;
      id: string;
      name: string;
      type: string;
    }>,
  };
});

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('nuqs', () => ({
  parseAsArrayOf: () => ({
    withDefault: () => ({
      withOptions: () => ({}),
    }),
  }),
  parseAsString: {},
  useQueryState: (key: string, options?: { defaultValue?: unknown }) => {
    if (key === 'user_id') return [testState.userId, vi.fn()];
    if (key === 'group_ids') return [testState.groupIds, vi.fn()];
    if (key === 'month') return [testState.month, vi.fn()];
    return [options?.defaultValue ?? '', vi.fn()];
  },
}));

vi.mock('../../../../hooks/use-debounce', () => ({
  useDebounce: (value: string) => [value],
}));

vi.mock('../finance-route-context', () => ({
  useFinanceHref: () => (path: string) => path,
}));

vi.mock('../shared/use-finance-confidential-visibility', () => ({
  useFinanceConfidentialVisibility: () => ({ isConfidential: false }),
}));

vi.mock('./components/invoice-blocked-state', () => ({
  InvoiceBlockedState: () => null,
}));

vi.mock('./components/invoice-checkout-summary', () => ({
  InvoiceCheckoutSummary: () => null,
}));

vi.mock('./components/invoice-content-editor', () => ({
  InvoiceContentEditor: () => null,
}));

vi.mock('./components/invoice-customer-select-card', () => ({
  InvoiceCustomerSelectCard: () => null,
}));

vi.mock('./components/invoice-payment-settings', () => ({
  InvoicePaymentSettings: (props: unknown) => {
    testState.InvoicePaymentSettings(props);
    return null;
  },
}));

vi.mock('./components/invoice-products-permission-warning', () => ({
  InvoiceProductsPermissionWarning: () => null,
  isPermissionRequestError: () => false,
}));

vi.mock('./components/subscription-attendance-summary', () => ({
  SubscriptionAttendanceSummary: () => null,
}));

vi.mock('./components/subscription-group-selector', () => ({
  SubscriptionGroupSelector: () => null,
}));

vi.mock('./components/subscription-prepaid-controls', () => ({
  SubscriptionPrepaidControls: () => null,
}));

vi.mock('./create-promotion-dialog', () => ({
  CreatePromotionDialog: () => null,
}));

vi.mock('./product-selection', () => ({
  ProductSelection: (props: {
    onSelectedProductsChange: (
      products: typeof testState.selectedProducts
    ) => void;
  }) => {
    if (!testState.productSelectionInjected) {
      testState.productSelectionInjected = true;
      queueMicrotask(() =>
        props.onSelectedProductsChange(testState.selectedProducts)
      );
    }
    return null;
  },
}));

vi.mock('./hooks', () => ({
  useAvailablePromotions: () => ({ data: [] }),
  useCategories: (wsId: string, options?: unknown) => {
    testState.useCategories(wsId, options);
    return { data: testState.categories };
  },
  useInvoiceAttendanceConfig: () => ({ data: true }),
  useInvoiceBlockedGroups: () => ({ data: [] }),
  useInvoiceCustomerSearch: () => ({
    customers: [],
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    selectedUser: { id: testState.userId, display_name: 'Customer' },
  }),
  useMultiGroupProducts: () => ({
    data: [],
    error: null,
    isLoading: false,
  }),
  useProducts: () => ({
    data: testState.products,
    error: null,
    isLoading: false,
  }),
  useSubscriptionInvoiceContext: () => ({
    data: { attendance: [], latestInvoices: [] },
    error: null,
    isLoading: false,
  }),
  useUserGroups: () => ({
    data: [
      {
        workspace_user_groups: {
          ending_date: null,
          id: 'group-1',
          name: 'Group 1',
          sessions: ['2026-07-05'],
          starting_date: '2026-07-01',
        },
      },
    ],
    isLoading: false,
  }),
  useUserLinkedPromotions: () => ({ data: [] }),
  useUserReferralDiscounts: () => ({ data: [] }),
  useWallets: (wsId: string, options?: unknown) => {
    testState.useWallets(wsId, options);
    return { data: testState.wallets };
  },
}));

vi.mock('./hooks/use-best-promotion-selection', () => ({
  useBestPromotionSelection: () => undefined,
}));

vi.mock('./hooks/use-invoice-rounding', () => ({
  useInvoiceRounding: () => ({
    resetRounding: vi.fn(),
    roundDown: vi.fn(),
    roundUp: vi.fn(),
    roundedTotal: 100,
  }),
}));

vi.mock('./hooks/use-invoice-subtotal', () => ({
  useInvoiceSubtotal: () => 100,
}));

vi.mock('./hooks/use-subscription-auto-selection', () => ({
  useSubscriptionAutoSelection: () => undefined,
}));

vi.mock('./hooks/use-subscription-invoice-content', () => ({
  useSubscriptionInvoiceContent: () => undefined,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function Wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

function renderSubscriptionInvoice(
  props: Partial<ComponentProps<typeof SubscriptionInvoice>> = {}
) {
  return render(
    <SubscriptionInvoice
      wsId="ws-1"
      createMultipleInvoices={false}
      defaultCategoryId="category-default"
      defaultCurrency="VND"
      defaultWalletId="wallet-default"
      workspaceTimezone="Asia/Ho_Chi_Minh"
      {...props}
    />,
    { wrapper: Wrapper }
  );
}

describe('SubscriptionInvoice checkout defaults', () => {
  beforeEach(() => {
    testState.InvoicePaymentSettings.mockClear();
    testState.useCategories.mockClear();
    testState.useWallets.mockClear();
    testState.productSelectionInjected = false;
    testState.products[0]!.finance_category_id = null;
    testState.wallets = [];
    testState.categories = [];
  });

  it('preloads payment options from defaults and keeps default IDs while options load', async () => {
    const { rerender } = renderSubscriptionInvoice();

    expect(testState.useWallets).toHaveBeenCalledWith('ws-1', {
      enabled: true,
    });
    expect(testState.useCategories).toHaveBeenCalledWith('ws-1', {
      enabled: true,
    });

    await waitFor(() =>
      expect(testState.InvoicePaymentSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categories: [],
          selectedCategoryId: 'category-default',
          selectedWalletId: 'wallet-default',
          wallets: [],
        })
      )
    );

    testState.wallets = [
      {
        currency: 'VND',
        id: 'wallet-default',
        name: 'Default wallet',
        type: 'STANDARD',
      },
    ];
    testState.categories = [
      {
        id: 'category-default',
        name: 'Default category',
      },
    ];

    rerender(
      <SubscriptionInvoice
        wsId="ws-1"
        createMultipleInvoices={false}
        defaultCategoryId="category-default"
        defaultCurrency="VND"
        defaultWalletId="wallet-default"
        workspaceTimezone="Asia/Ho_Chi_Minh"
      />
    );

    await waitFor(() =>
      expect(testState.InvoicePaymentSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categories: testState.categories,
          selectedCategoryId: 'category-default',
          selectedWalletId: 'wallet-default',
          wallets: testState.wallets,
        })
      )
    );
  });
});
