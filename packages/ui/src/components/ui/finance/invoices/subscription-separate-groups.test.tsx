import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { SubscriptionInvoiceContextResponse } from '@tuturuuu/internal-api/finance';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { WorkspaceVisibilityProvider } from '../../../../hooks/use-workspace-visibility';
import { useSubscriptionAutoSelection } from './hooks/use-subscription-auto-selection';
import { useSubscriptionCreate } from './hooks/use-subscription-create';
import { useSubscriptionInvoiceContext } from './hooks/use-subscription-invoice-context';
import {
  isSelectedSubscriptionRangePaid,
  isSubscriptionContextReady,
} from './subscription-admission';
import type { Product, SelectedProductItem, UserGroupProducts } from './types';
import type { UserGroup } from './utils';

const translate = (key: string) => key;
vi.mock('next-intl', () => ({
  useTranslations: () => translate,
  useLocale: () => 'en',
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: vi.fn() }));
vi.mock('../finance-route-context', () => ({
  useFinanceHref: () => (path: string) => path,
}));

const transport = vi.fn();
const invoiceRequest = z.object({
  group_ids: z.array(z.string()),
  selected_month: z.string(),
  customer_id: z.string(),
  products: z.array(z.object({ quantity: z.number() })),
});
const writes: z.infer<typeof invoiceRequest>[] = [];
const paidGroups = new Set<string>();
const groups = ['class-a', 'class-b'];
const inventory = {
  unit_id: 'unit',
  warehouse_id: 'warehouse',
  amount: null,
  min_amount: 0,
  price: 100,
  unit_name: 'Session',
  warehouse_name: 'Main',
};
const product: Product = {
  id: 'tuition',
  name: 'Tuition',
  manufacturer: null,
  description: null,
  usage: null,
  category: null,
  category_id: 'category',
  ws_id: 'ws',
  created_at: null,
  inventory: [inventory],
};
const memberships: UserGroup[] = groups.map((id) => ({
  workspace_user_groups: {
    id,
    name: id,
    starting_date: '2026-01-01',
    ending_date: null,
    sessions: ['2026-01-05', '2026-01-12'],
    archived: false,
    cert_template: 'original',
    created_at: null,
    creator_id: null,
    description: null,
    is_course_published: false,
    is_guest: false,
    notes: null,
    ws_id: 'ws',
  },
}));
const links: UserGroupProducts[] = groups.map((group_id) => ({
  group_id,
  workspace_products: {
    id: 'tuition',
    name: 'Tuition',
    product_categories: null,
  },
  inventory_units: { id: 'unit', name: 'Session' },
  warehouse_id: 'warehouse',
}));
const products = [product];
const reset = () => {};

function Form({ groupIds }: { groupIds: string[] }) {
  const context = useSubscriptionInvoiceContext(
    'ws',
    'customer',
    groupIds,
    '2026-01'
  );
  const [selected, setSelected] = useState<SelectedProductItem[]>([]);
  useSubscriptionAutoSelection({
    enabled: !!context.data,
    selectedGroupIds: groupIds,
    selectedMonth: '2026-01',
    groupProducts: links.filter((link) =>
      groupIds.includes(link.group_id ?? '')
    ),
    products,
    userGroups: memberships,
    useAttendanceBased: false,
    userAttendance: context.data?.attendance ?? [],
    latestSubscriptionInvoices: context.data?.latestInvoices ?? [],
    onSelectedProductsChange: setSelected,
  });
  const covered = isSelectedSubscriptionRangePaid(
    groupIds,
    '2026-01',
    1,
    context.data?.latestInvoices ?? []
  );
  const ready = isSubscriptionContextReady({
    groupIds,
    scheduledSessionsByGroupId: context.data?.scheduledSessionsByGroupId,
    loading: context.isFetching,
    error: context.error,
  });
  const creation = useSubscriptionCreate({
    wsId: 'ws',
    payload: {
      customer_id: 'customer',
      group_ids: groupIds,
      selected_month: '2026-01',
      content: 'Tuition',
      wallet_id: 'wallet',
      products: selected.map((row) => ({
        product_id: row.product.id,
        unit_id: row.inventory.unit_id,
        warehouse_id: row.inventory.warehouse_id,
        quantity: row.quantity,
        price: row.inventory.price,
        category_id: 'category',
      })),
      category_id: 'category',
    },
    options: {
      createMultipleInvoices: true,
      printAfterCreate: false,
      downloadImageAfterCreate: false,
    },
    blockedReason: undefined,
    checkoutReady: ready && !covered && selected.length > 0,
    areNumbersHidden: false,
    currency: 'VND',
    onReset: reset,
  });
  return (
    <>
      <output aria-label="coverage">{covered ? 'covered' : 'unpaid'}</output>
      <output aria-label="quantity">
        {selected.reduce((sum, row) => sum + row.quantity, 0)}
      </output>
      <button
        type="button"
        disabled={!ready || covered || !selected.length || creation.creating}
        onClick={() => void creation.submit()}
      >
        Create
      </button>
    </>
  );
}

function mount(groupIds: string[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (ids: string[]) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="operator">
        <Form groupIds={ids} />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  const rendered = render(view(groupIds));
  return {
    ...rendered,
    client,
    select: (ids: string[]) => rendered.rerender(view(ids)),
  };
}

beforeEach(() => {
  writes.length = 0;
  paidGroups.clear();
  transport.mockReset();
  transport.mockImplementation(async (input: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const payload = invoiceRequest.parse(JSON.parse(String(options.body)));
      writes.push(payload);
      for (const id of payload.group_ids) paidGroups.add(id);
      return Response.json({ invoice_id: `invoice-${writes.length}` });
    }
    const requestedGroups = new URL(
      input,
      'https://example.test'
    ).searchParams.getAll('groupIds');
    const context: SubscriptionInvoiceContextResponse = {
      attendance: [],
      latestInvoices: requestedGroups
        .filter((id) => paidGroups.has(id))
        .map((group_id) => ({
          group_id,
          valid_until: '2026-02-01',
          covered_months: ['2026-01-01'],
        })),
      scheduledSessionsByGroupId: Object.fromEntries(
        requestedGroups.map((id) => [id, ['2026-01-05', '2026-01-12']])
      ),
    };
    return Response.json(context);
  });
  vi.stubGlobal('fetch', transport);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('separate subscription invoices for the same customer and month', () => {
  it('creates A then B, rereads invalidated A coverage, and blocks A again', async () => {
    const form = mount(['class-b']);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
    );
    form.select(['class-a']);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(screen.getByLabelText('coverage')).toHaveTextContent('covered')
    );
    form.select(['class-b']);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
    );
    expect(screen.getByLabelText('quantity')).toHaveTextContent('2');
    await waitFor(() =>
      expect(
        transport.mock.calls.filter(([url]) =>
          String(url).includes('groupIds=class-b')
        )
      ).toHaveLength(2)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(screen.getByLabelText('coverage')).toHaveTextContent('covered')
    );
    expect(
      writes.map(({ group_ids, customer_id, selected_month }) => ({
        group_ids,
        customer_id,
        selected_month,
      }))
    ).toEqual([
      {
        group_ids: ['class-a'],
        customer_id: 'customer',
        selected_month: '2026-01',
      },
      {
        group_ids: ['class-b'],
        customer_id: 'customer',
        selected_month: '2026-01',
      },
    ]);
    form.select(['class-a']);
    await waitFor(() =>
      expect(screen.getByLabelText('coverage')).toHaveTextContent('covered')
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(writes).toHaveLength(2);
    await waitFor(() =>
      expect(
        transport.mock.calls.filter(([url]) =>
          String(url).includes('groupIds=class-a')
        )
      ).toHaveLength(3)
    );
  });

  it('preserves a combined A+B invoice with both groups billable', async () => {
    mount(groups);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
    );
    expect(screen.getByLabelText('quantity')).toHaveTextContent('4');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(screen.getByLabelText('coverage')).toHaveTextContent('covered')
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.group_ids).toEqual(groups);
    expect(writes[0]?.products.map(({ quantity }) => quantity)).toEqual([2, 2]);
  });
});
