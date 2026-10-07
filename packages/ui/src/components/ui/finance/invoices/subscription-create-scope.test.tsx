import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useWorkspaceActor,
  WorkspaceVisibilityProvider,
} from '../../../../hooks/use-workspace-visibility';
import { SubscriptionInvoice } from './subscription-invoice';
import type { UserGroupProducts } from './types';

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
    push: vi.fn(),
    toast: vi.fn(),
    InvoicePaymentSettings: vi.fn(),
    SubscriptionAttendanceSummary: vi.fn(),
    categories: [] as Array<{ id: string; name: string }>,
    groupIds: ['group-1'],
    month: '2026-07',
    setMonth: vi.fn(),
    setUserId: vi.fn(),
    productSelectionInjected: false,
    products: [product],
    productsError: null as Error | null,
    userGroupsError: null as Error | null,
    groupProductsError: null as Error | null,
    contextError: null as Error | null,
    actualAutoSelection: false,
    groupProducts: [] as UserGroupProducts[],
    contextLoading: false,
    scheduleMap: { 'group-1': ['2026-07-05'] } as
      | Record<string, string[]>
      | undefined,
    createInvoice: vi.fn(),
    refetchUserGroups: vi.fn(),
    refetchGroupProducts: vi.fn(),
    refetchContext: vi.fn(),
    refetchProducts: vi.fn(),
    refetchUsers: vi.fn(),
    selectedProducts: [{ inventory, product, quantity: 1 }],
    useCategories: vi.fn(),
    useWallets: vi.fn(),
    userId: 'user-1',
    userGroups: [
      {
        workspace_user_groups: {
          ending_date: null as string | null,
          id: 'group-1',
          name: 'Group 1',
          sessions: ['2026-07-05'],
          starting_date: '2026-07-01',
        },
      },
    ],
    wallets: [] as Array<{
      currency: string;
      id: string;
      name: string;
      type: string;
    }>,
  };
});

vi.mock('./internal-api', () => ({
  createSubscriptionInvoiceWithInternalApi: testState.createInvoice,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({ toast: testState.toast }));

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: testState.push }),
}));

vi.mock('nuqs', () => ({
  parseAsArrayOf: () => ({
    withDefault: () => ({
      withOptions: () => ({}),
    }),
  }),
  parseAsString: {},
  useQueryState: (key: string, options?: { defaultValue?: unknown }) => {
    if (key === 'user_id') return [testState.userId, testState.setUserId];
    if (key === 'group_ids') return [testState.groupIds, vi.fn()];
    if (key === 'month') return [testState.month, testState.setMonth];
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
  InvoiceContentEditor: ({
    contentValue,
    onContentChange,
  }: {
    contentValue: string;
    onContentChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Synthetic draft content"
      value={contentValue}
      onChange={(event) => onContentChange(event.target.value)}
    />
  ),
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
  SubscriptionAttendanceSummary: (props: unknown) => {
    testState.SubscriptionAttendanceSummary(props);
    return null;
  },
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
    refetch: testState.refetchUsers,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    selectedUser: { id: testState.userId, display_name: 'Customer' },
  }),
  useMultiGroupProducts: () => ({
    data: testState.groupProducts,
    error: testState.groupProductsError,
    refetch: testState.refetchGroupProducts,
    isLoading: false,
  }),
  useProducts: () => ({
    data: testState.products,
    error: testState.productsError,
    refetch: testState.refetchProducts,
    isLoading: false,
  }),
  useSubscriptionInvoiceContext: () => ({
    data: {
      attendance: [],
      latestInvoices: [],
      scheduledSessionsByGroupId: testState.scheduleMap,
    },
    error: testState.contextError,
    refetch: testState.refetchContext,
    isLoading: testState.contextLoading,
  }),
  useUserGroups: () => ({
    data: testState.userGroups,
    error: testState.userGroupsError,
    refetch: testState.refetchUserGroups,
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

vi.mock('./hooks/use-subscription-auto-selection', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('./hooks/use-subscription-auto-selection')
    >();
  return {
    useSubscriptionAutoSelection: (
      props: Parameters<typeof original.useSubscriptionAutoSelection>[0]
    ) =>
      original.useSubscriptionAutoSelection({
        ...props,
        enabled: testState.actualAutoSelection,
      }),
  };
});

vi.mock('./hooks/use-subscription-invoice-content', () => ({
  useSubscriptionInvoiceContent: () => undefined,
}));

function held() {
  let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let observedActor: ReturnType<typeof useWorkspaceActor>;
function ActorWitness() {
  observedActor = useWorkspaceActor();
  return null;
}
function mount(createMultipleInvoices = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (actor: string, ws: string) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId={actor}>
        <ActorWitness />
        <SubscriptionInvoice
          wsId={ws}
          createMultipleInvoices={createMultipleInvoices}
          defaultCategoryId="category-default"
          defaultCurrency="VND"
          defaultWalletId="wallet-default"
          workspaceTimezone="Asia/Ho_Chi_Minh"
        />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  const result = render(view('account-A', 'ws-1'));
  return {
    ...result,
    client,
    redraw: (actor = 'account-A', ws = 'ws-1') => {
      testState.productSelectionInjected = false;
      result.rerender(view(actor, ws));
    },
  };
}
async function ready() {
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: 'ws-invoices.create_subscription_invoice',
      })
    ).not.toBeDisabled()
  );
}
async function start() {
  await ready();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'ws-invoices.create_subscription_invoice',
    })
  );
  await waitFor(() => expect(testState.createInvoice).toHaveBeenCalledOnce());
}
const saved = { invoice_id: 'synthetic-invoice' };
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  testState.createInvoice.mockReset();
  testState.createInvoice.mockResolvedValue(saved);
  testState.productSelectionInjected = false;
  testState.userId = 'user-1';
  testState.groupIds = ['group-1'];
  testState.month = '2026-07';
  testState.contextLoading = false;
  testState.contextError = null;
  testState.productsError = null;
  testState.groupProductsError = null;
  testState.userGroupsError = null;
  testState.actualAutoSelection = false;
  testState.groupProducts = [];
  testState.scheduleMap = { 'group-1': ['2026-07-05'] };
});
describe('actual invoice create completion lifetime', () => {
  it('current actor/workspace success remains truthful and navigates to its admitted invoice', async () => {
    mount();
    await start();
    await waitFor(() =>
      expect(testState.push).toHaveBeenCalledWith(
        '/ws-1/invoices/synthetic-invoice'
      )
    );
    expect(testState.toast).toHaveBeenCalledWith(
      'ws-invoices.subscription_invoice_created_success'
    );
    expect(testState.createInvoice.mock.calls[0]?.[0]).toBe('ws-1');
    expect(testState.createInvoice.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        customer_id: 'user-1',
        group_ids: ['group-1'],
        selected_month: '2026-07',
      })
    );
  });
  it('current-scope failure remains visible and permits retry', async () => {
    testState.createInvoice.mockRejectedValueOnce(
      new Error('Synthetic failure')
    );
    mount();
    await start();
    await waitFor(() =>
      expect(testState.toast).toHaveBeenCalledWith(
        'ws-invoices.error_creating_subscription_invoice'
      )
    );
    await ready();
    expect(testState.push).not.toHaveBeenCalled();
  });
  for (const boundary of [
    'actor ABA',
    'workspace ABA',
    'customer ABA',
    'unmount',
  ] as const) {
    for (const outcome of ['success', 'error'] as const) {
      it(`late ${outcome} after ${boundary} cannot announce or navigate in a later lifetime`, async () => {
        const old = held();
        testState.createInvoice.mockReturnValueOnce(old.promise);
        const view = mount();
        await start();
        const oldActor = observedActor;
        if (boundary === 'actor ABA') {
          view.redraw('account-B');
          await ready();
          view.redraw('account-A');
          await ready();
          expect(() => oldActor?.assertActive()).toThrow(
            'Workspace account changed'
          );
          expect(() => observedActor?.assertActive()).not.toThrow();
        } else if (boundary === 'customer ABA') {
          testState.userId = 'user-2';
          view.redraw();
          await act(async () => {
            await Promise.resolve();
          });
          testState.userId = 'user-1';
          view.redraw();
          await act(async () => {
            await Promise.resolve();
          });
        } else if (boundary === 'workspace ABA') {
          view.redraw('account-A', 'ws-2');
          view.redraw('account-A', 'ws-1');
        } else view.unmount();
        await act(async () => {
          if (outcome === 'success') old.resolve(saved);
          else old.reject(new Error('Synthetic old failure'));
          await old.promise.catch(() => {});
        });
        expect(testState.push).not.toHaveBeenCalled();
        expect(testState.toast).not.toHaveBeenCalled();
      });
    }
  }
  for (const multiple of [false, true]) {
    it(`preserves a newer same-customer draft after old success (multiple=${multiple})`, async () => {
      const old = held();
      testState.createInvoice.mockReturnValueOnce(old.promise);
      mount(multiple);
      fireEvent.change(screen.getByLabelText('Synthetic draft content'), {
        target: { value: 'Admitted draft' },
      });
      await start();
      const admitted = structuredClone(
        testState.createInvoice.mock.calls[0]?.[1]
      );
      fireEvent.change(screen.getByLabelText('Synthetic draft content'), {
        target: { value: 'Newer draft' },
      });
      await act(async () => {
        old.resolve(saved);
        await old.promise;
      });
      expect(screen.getByLabelText('Synthetic draft content')).toHaveValue(
        'Newer draft'
      );
      expect(testState.createInvoice.mock.calls[0]?.[1]).toEqual(admitted);
      expect(testState.setUserId).not.toHaveBeenCalled();
      expect(testState.push).not.toHaveBeenCalled();
      expect(testState.toast).not.toHaveBeenCalled();
      await ready();
    });
  }
  it('current multiple-create success performs its own reset', async () => {
    mount(true);
    fireEvent.change(screen.getByLabelText('Synthetic draft content'), {
      target: { value: 'Current draft' },
    });
    await start();
    await waitFor(() => expect(testState.setUserId).toHaveBeenCalledWith(null));
    expect(screen.getByLabelText('Synthetic draft content')).toHaveValue('');
    expect(testState.push).not.toHaveBeenCalled();
    expect(testState.toast).toHaveBeenCalledWith(
      'ws-invoices.subscription_invoice_created_success'
    );
  });
  it('old finally cannot clear a new scope pending owner', async () => {
    const old = held(),
      current = held();
    testState.createInvoice
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const view = mount();
    await start();
    view.redraw('account-A', 'ws-2');
    await ready();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-invoices.create_subscription_invoice',
      })
    );
    await waitFor(() =>
      expect(testState.createInvoice).toHaveBeenCalledTimes(2)
    );
    await act(async () => {
      old.resolve(saved);
      await old.promise;
    });
    expect(
      screen.getByRole('button', {
        name: 'ws-invoices.creating_subscription_invoice',
      })
    ).toBeDisabled();
    expect(testState.push).not.toHaveBeenCalled();
    expect(testState.toast).not.toHaveBeenCalled();
    await act(async () => {
      current.resolve(saved);
      await current.promise;
    });
    expect(testState.push).toHaveBeenCalledWith(
      '/ws-2/invoices/synthetic-invoice'
    );
    await ready();
  });
  it('duplicate clicks admit only one write', async () => {
    const pending = held();
    testState.createInvoice.mockReturnValueOnce(pending.promise);
    mount();
    await ready();
    const button = screen.getByRole('button', {
      name: 'ws-invoices.create_subscription_invoice',
    });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(testState.createInvoice).toHaveBeenCalledOnce();
    await act(async () => {
      pending.resolve(saved);
      await pending.promise;
    });
  });
});
