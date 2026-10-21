import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { SubscriptionInvoiceContextResponse } from '@tuturuuu/internal-api/finance';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceVisibilityProvider } from '../../../../hooks/use-workspace-visibility';
import { SubscriptionInvoice } from './subscription-invoice';
import type { Product, UserGroupProducts } from './types';
import type { UserGroup } from './utils';

const fixture = vi.hoisted(() => ({
  initialGroups: ['class-a'],
  distinctProduct: false,
  missingProduct: false,
  push: vi.fn(),
}));
const translate = Object.assign((key: string) => key, { has: () => false });
vi.mock('next-intl', () => ({
  useTranslations: () => translate,
  useLocale: () => 'en',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: fixture.push }),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: vi.fn() }));
vi.mock('../finance-route-context', () => ({
  useFinanceHref: () => (path: string) => path,
}));
vi.mock('../shared/use-finance-confidential-visibility', () => ({
  useFinanceConfidentialVisibility: () => ({ isConfidential: false }),
}));
vi.mock('nuqs', async () => {
  const { useCallback, useState } = await import('react');
  return {
    parseAsString: {},
    parseAsArrayOf: () => ({
      withDefault: () => ({ withOptions: () => ({}) }),
    }),
    useQueryState: (key: string) => {
      const initial: string | string[] =
        key === 'group_ids'
          ? fixture.initialGroups
          : key === 'user_id'
            ? 'customer'
            : '2026-01';
      const [value, update] = useState(initial);
      const set = useCallback(
        (
          next:
            | typeof initial
            | null
            | ((previous: typeof initial) => typeof initial)
        ) => {
          update((previous) =>
            typeof next === 'function'
              ? next(previous)
              : (next ?? (Array.isArray(previous) ? [] : ''))
          );
        },
        []
      );
      return [value, set];
    },
  };
});
vi.mock('./hooks', async (importOriginal) => {
  const hooks = await importOriginal<typeof import('./hooks')>();
  return {
    ...hooks,
    useInvoiceCustomerSearch: () => ({
      customers: [],
      selectedUser: { id: 'customer', display_name: 'Customer' },
      isLoading: false,
    }),
    useInvoiceAttendanceConfig: () => ({ data: true }),
    useInvoiceBlockedGroups: () => ({ data: [] }),
    useAvailablePromotions: () => ({ data: [] }),
    useUserLinkedPromotions: () => ({ data: [] }),
    useUserReferralDiscounts: () => ({ data: [] }),
    useWallets: () => ({ data: [] }),
    useCategories: () => ({ data: [] }),
  };
});
vi.mock('./components/invoice-customer-select-card', () => ({
  InvoiceCustomerSelectCard: () => null,
}));
vi.mock('./components/invoice-payment-settings', () => ({
  InvoicePaymentSettings: () => null,
}));
vi.mock('./components/invoice-content-editor', () => ({
  InvoiceContentEditor: () => null,
}));
vi.mock('./components/invoice-checkout-summary', () => ({
  InvoiceCheckoutSummary: ({ roundedTotal }: { roundedTotal: number }) => (
    <output aria-label="invoice total">{roundedTotal}</output>
  ),
}));
vi.mock('./components/subscription-attendance-summary', () => ({
  SubscriptionAttendanceSummary: ({
    selectedMonth,
  }: {
    selectedMonth: string;
  }) => <output aria-label="billing month">{selectedMonth}</output>,
}));
vi.mock('./components/subscription-prepaid-controls', () => ({
  SubscriptionPrepaidControls: () => null,
}));
vi.mock('./create-promotion-dialog', () => ({
  CreatePromotionDialog: () => null,
}));
vi.mock('./product-selection', () => ({
  ProductSelection: ({
    selectedProducts,
  }: {
    selectedProducts: Array<{ quantity: number }>;
  }) => (
    <output aria-label="billable quantity">
      {selectedProducts.reduce((sum, row) => sum + row.quantity, 0)}
    </output>
  ),
}));

const transport = vi.fn();
const requests: Array<{ group_ids: string[] }> = [];
const paid = new Set<string>();
const groups = ['class-a', 'class-b'];
const membership: UserGroup[] = groups.map((id) => ({
  workspace_user_groups: {
    id,
    name: id === 'class-a' ? 'Class A' : 'Class B',
    archived: false,
    cert_template: 'original',
    created_at: null,
    creator_id: null,
    description: null,
    ending_date: id === 'class-a' ? null : '2026-01-31',
    is_course_published: false,
    is_guest: false,
    notes: null,
    starting_date: '2026-01-01',
    ws_id: 'ws',
    sessions: ['2026-01-05', '2026-01-12'],
  },
}));
const product: Product = {
  id: 'tuition',
  name: 'Shared tuition',
  manufacturer: null,
  description: null,
  usage: null,
  category: null,
  category_id: 'category',
  finance_category_id: 'category',
  ws_id: 'ws',
  created_at: null,
  inventory: [
    {
      unit_id: 'unit',
      warehouse_id: 'warehouse',
      amount: null,
      min_amount: 0,
      price: 100,
      unit_name: 'Session',
      warehouse_name: 'Main',
    },
  ],
};
const linkedProducts: UserGroupProducts[] = groups.map((group_id) => ({
  group_id,
  workspace_user_groups: { name: group_id },
  workspace_products: {
    id: product.id,
    name: product.name,
    product_categories: null,
  },
  inventory_units: { id: 'unit', name: 'Session' },
  warehouse_id: 'warehouse',
}));

function row(index: number) {
  const button = screen.getAllByRole('button', {
    name: 'ws-invoices.select_group',
  })[index];
  if (!button) throw new Error(`Missing class selector ${index}`);
  return button;
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="operator">
        <SubscriptionInvoice
          wsId="ws"
          defaultWalletId="wallet"
          defaultCategoryId="category"
          createMultipleInvoices={false}
          workspaceTimezone="Asia/Ho_Chi_Minh"
        />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  fixture.initialGroups = ['class-a'];
  fixture.distinctProduct = false;
  fixture.missingProduct = false;
  requests.length = 0;
  paid.clear();
  transport.mockReset();
  transport.mockImplementation(async (input: string, options?: RequestInit) => {
    const url = new URL(input, 'https://example.test');
    if (url.pathname.endsWith('/user-groups/linked-products')) {
      const selected = url.searchParams.getAll('groupIds');
      return Response.json({
        items: linkedProducts
          .filter(
            (link) =>
              selected.includes(link.group_id ?? '') &&
              !(fixture.missingProduct && link.group_id === 'class-b')
          )
          .map((link) =>
            fixture.distinctProduct && link.group_id === 'class-b'
              ? {
                  ...link,
                  workspace_products: {
                    ...link.workspace_products,
                    id: 'tuition-b',
                  },
                }
              : link
          ),
      });
    }
    if (url.pathname.endsWith('/user-groups')) return Response.json(membership);
    if (url.pathname.endsWith('/inventory/products')) {
      const products = fixture.distinctProduct
        ? [
            product,
            {
              ...product,
              id: 'tuition-b',
              inventory: product.inventory.map((item) => ({
                ...item,
                price: 200,
              })),
            },
          ]
        : [product];
      return Response.json({ data: products, count: products.length });
    }
    if (url.pathname.endsWith('/subscription/context')) {
      const selected = url.searchParams.getAll('groupIds');
      const response: SubscriptionInvoiceContextResponse = {
        attendance: selected.flatMap((group_id) => [
          { group_id, date: '2026-01-05', status: 'PRESENT' },
          { group_id, date: '2026-01-12', status: 'LATE' },
        ]),
        latestInvoices: selected
          .filter((id) => paid.has(id))
          .map((group_id) => ({
            group_id,
            created_at: '2026-01-21T10:00:00Z',
            valid_until: '2026-02-01',
            covered_months: ['2026-01-01'],
          })),
        scheduledSessionsByGroupId: Object.fromEntries(
          selected.map((id) => [id, ['2026-01-05', '2026-01-12']])
        ),
      };
      return Response.json(response);
    }
    if (url.pathname.endsWith('/subscription') && options?.method === 'POST') {
      const body: unknown = JSON.parse(String(options.body));
      if (
        !body ||
        typeof body !== 'object' ||
        !('group_ids' in body) ||
        !Array.isArray(body.group_ids) ||
        !body.group_ids.every((id) => typeof id === 'string')
      )
        throw new Error('Invalid synthetic invoice request');
      requests.push({ group_ids: body.group_ids });
      for (const id of body.group_ids) paid.add(id);
      return Response.json({ invoice_id: `invoice-${requests.length}` });
    }
    throw new Error(`Unexpected fixture request ${url.pathname}`);
  });
  vi.stubGlobal('fetch', transport);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('actual invoice form membership and group selector', () => {
  it.each([false, true])(
    'keeps the last paid class deselected while choosing the second class (distinct product: %s)',
    async (distinctProduct) => {
      fixture.distinctProduct = distinctProduct;
      mount();
      await waitFor(() =>
        expect(
          screen.getByRole('button', {
            name: 'ws-invoices.create_subscription_invoice',
          })
        ).toBeEnabled()
      );
      await waitFor(() =>
        expect(screen.getByLabelText('invoice total')).toHaveTextContent('200')
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: 'ws-invoices.create_subscription_invoice',
        })
      );
      await waitFor(() =>
        expect(requests).toEqual([{ group_ids: ['class-a'] }])
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('button', {
            name: 'ws-invoices.create_subscription_invoice',
          })
        ).not.toBeInTheDocument()
      );
      fireEvent.click(row(0));
      await waitFor(() =>
        expect(row(0)).toHaveAttribute('aria-pressed', 'false')
      );
      expect(row(1)).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(row(1));
      await waitFor(() =>
        expect(
          screen.getByRole('button', {
            name: 'ws-invoices.create_subscription_invoice',
          })
        ).toBeEnabled()
      );
      expect(row(0)).toHaveAttribute('aria-pressed', 'false');
      expect(row(1)).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('billing month')).toHaveTextContent(
        '2026-01'
      );
      await waitFor(() =>
        expect(screen.getByLabelText('invoice total')).toHaveTextContent(
          distinctProduct ? '400' : '200'
        )
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: 'ws-invoices.create_subscription_invoice',
        })
      );
      await waitFor(() =>
        expect(requests).toEqual([
          { group_ids: ['class-a'] },
          { group_ids: ['class-b'] },
        ])
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('button', {
            name: 'ws-invoices.create_subscription_invoice',
          })
        ).not.toBeInTheDocument()
      );
      fireEvent.click(row(0));
      fireEvent.click(row(1));
      await waitFor(() =>
        expect(row(0)).toHaveAttribute('aria-pressed', 'true')
      );
      expect(row(1)).toHaveAttribute('aria-pressed', 'false');
      expect(
        screen.queryByRole('button', {
          name: 'ws-invoices.create_subscription_invoice',
        })
      ).not.toBeInTheDocument();
      expect(requests).toHaveLength(2);
    }
  );

  it('preserves initial all-group defaults and an explicit deselect-all', async () => {
    fixture.initialGroups = [];
    mount();
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'ws-invoices.create_subscription_invoice',
        })
      ).toBeEnabled()
    );
    expect(row(0)).toHaveAttribute('aria-pressed', 'true');
    expect(row(1)).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(
      screen.getByRole('button', { name: 'ws-invoices.deselect_all' })
    );
    await waitFor(() =>
      expect(row(0)).toHaveAttribute('aria-pressed', 'false')
    );
    expect(row(1)).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-invoices.select_all_with_schedule',
      })
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'ws-invoices.create_subscription_invoice',
        })
      ).toBeEnabled()
    );
    await waitFor(() =>
      expect(screen.getByLabelText('invoice total')).toHaveTextContent('400')
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-invoices.create_subscription_invoice',
      })
    );
    await waitFor(() => expect(requests).toEqual([{ group_ids: groups }]));
  });

  it('does not invent linked charges for a class with no linked product', async () => {
    fixture.initialGroups = ['class-b'];
    fixture.missingProduct = true;
    mount();
    await waitFor(() => expect(row(1)).toHaveAttribute('aria-pressed', 'true'));
    await waitFor(() =>
      expect(
        screen.getByText('ws-invoices.no_products_to_invoice')
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', {
        name: 'ws-invoices.create_subscription_invoice',
      })
    ).not.toBeInTheDocument();
    expect(requests).toEqual([]);
  });
});
