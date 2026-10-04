import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type {
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import messages from '../../../messages/en.json';
import { InventorySessionScope } from './inventory-session-scope';
import { SaleCreateDialog } from './sale-create-dialog';
import { SeasonPricesDialog } from './season-prices-dialog';

const api = vi.hoisted(() => ({
  products: vi.fn(),
  prices: vi.fn(),
  sale: vi.fn(),
  price: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/inventory', async (original) => ({
  ...(await original<typeof import('@tuturuuu/internal-api/inventory')>()),
  listInventoryProducts: api.products,
  listInventoryPrices: api.prices,
  createInventorySale: api.sale,
  createInventoryPrice: api.price,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
const period: InventorySalesPeriod = {
  id: 'season',
  name: 'Current season',
  pricing_mode: 'scheduled',
  status: 'active',
  starts_at: '2000-01-01',
  ends_at: '2100-01-01',
  time_zone: 'UTC',
  product_scope: 'all',
  product_ids: [],
  sale_count: 0,
  description: null,
  created_at: '',
  updated_at: '',
  ws_id: 'ws',
};
const product = (name: string): InventoryProductSummary => ({
  id: name,
  name,
  category_id: 'category',
  inventory: [
    {
      unit_id: 'unit',
      warehouse_id: 'warehouse',
      amount: 10,
      price: 99000,
      unit_name: 'Item',
      warehouse_name: 'Booth',
    },
  ],
});
const products = [product('Alpha'), product('Beta')];
const options: InventoryProductFormOptionsResponse = {
  categories: [],
  manufacturers: [],
  owners: [],
  units: [],
  warehouses: [],
  financeCategories: [{ id: 'finance', name: 'Revenue', ws_id: 'ws' }],
  wallets: [{ id: 'wallet', name: 'Wallet' }],
};
function mount(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <InventorySessionScope actorId="actor">
          {children}
        </InventorySessionScope>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}
function openSale(mode: 'legacy' | 'scheduled') {
  mount(
    <SaleCreateDialog
      wsId="ws"
      workspaceCurrency="VND"
      products={products}
      periods={[{ ...period, pricing_mode: mode }]}
      options={{ ...options, defaultSalesPeriodId: period.id }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
}
async function add(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Add ${name}` }));
}
function review() {
  fireEvent.mouseDown(screen.getByRole('tab', { name: /Checkout/ }), {
    button: 0,
    ctrlKey: false,
  });
  const save = screen.getByRole('button', { name: 'Record sale' });
  expect((save as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(save);
}
beforeAll(() => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  api.products.mockImplementation(
    async (_ws: string, params: { q: string }) => ({
      data: products.filter((p) =>
        p.name.toLowerCase().includes(params.q.toLowerCase())
      ),
    })
  );
  api.prices.mockImplementation(async () => ({
    as_of: new Date().toISOString(),
    data: products.map((p, i) => ({
      id: `quote-${p.id}`,
      period_id: 'season',
      product_id: p.id,
      unit_id: 'unit',
      warehouse_id: 'warehouse',
      currency: 'VND',
      price: 60000 + i * 10000,
      valid_from: '2000-01-01T00:00:00Z',
      valid_to: '2100-01-02T00:00:00Z',
    })),
  }));
  api.sale.mockResolvedValue({ invoice_id: 'synthetic' });
  api.price.mockResolvedValue({ data: {} });
});
afterEach(cleanup);
describe('mounted season sales integrations', () => {
  it.each(['scheduled', 'legacy'] as const)(
    'keeps A while searching B and submitting both in %s mode',
    async (mode) => {
      openSale(mode);
      await add('Alpha');
      fireEvent.change(
        screen.getByRole('textbox', {
          name: 'Search products, units, or warehouses',
        }),
        { target: { value: 'Beta' } }
      );
      await waitFor(() => expect(api.products).toHaveBeenCalled());
      await add('Beta');
      review();
      await waitFor(() => expect(api.sale).toHaveBeenCalledTimes(1));
      expect(api.sale.mock.calls[0]?.[1].products).toEqual([
        expect.objectContaining({
          product_id: 'Alpha',
          quantity: 1,
          price: mode === 'scheduled' ? 60000 : 99000,
        }),
        expect.objectContaining({
          product_id: 'Beta',
          quantity: 1,
          price: mode === 'scheduled' ? 70000 : 99000,
        }),
      ]);
    }
  );
  it('restores priced products and filter choices after clearing a settled empty search', async () => {
    openSale('scheduled');
    await screen.findByRole('button', { name: 'Add Alpha' });
    const search = screen.getByRole('textbox', {
      name: 'Search products, units, or warehouses',
    });
    fireEvent.change(search, { target: { value: 'nonexistent' } });
    await waitFor(() =>
      expect(api.products).toHaveBeenCalledWith(
        'ws',
        expect.objectContaining({ q: 'nonexistent' })
      )
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add Alpha' })).toBeNull()
    );
    fireEvent.change(search, { target: { value: '' } });
    await screen.findByRole('button', { name: 'Add Alpha' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Filters and sorting' })
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Category' }));
    expect(
      await screen.findByRole('option', { name: 'category' })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'category' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Warehouse' }));
    expect(await screen.findByRole('option', { name: 'Booth' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'Booth' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Filters and sorting' })
    );
    await add('Alpha');
    await add('Beta');
    review();
    await waitFor(() => expect(api.sale).toHaveBeenCalledTimes(1));
    expect(api.sale.mock.calls[0]?.[1].products).toEqual([
      expect.objectContaining({
        product_id: 'Alpha',
        warehouse_id: 'warehouse',
        price_id: 'quote-Alpha',
        price: 60000,
      }),
      expect.objectContaining({
        product_id: 'Beta',
        warehouse_id: 'warehouse',
        price_id: 'quote-Beta',
        price: 70000,
      }),
    ]);
  });
  it('keeps the base catalog after clearing while an old search resolves', async () => {
    let resolveSearch!: (value: { data: InventoryProductSummary[] }) => void;
    api.products.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        })
    );
    openSale('scheduled');
    await screen.findByRole('button', { name: 'Add Alpha' });
    const search = screen.getByRole('textbox', {
      name: 'Search products, units, or warehouses',
    });
    fireEvent.change(search, { target: { value: 'nonexistent' } });
    await waitFor(() => expect(api.products).toHaveBeenCalledTimes(1));
    fireEvent.change(search, { target: { value: '' } });
    resolveSearch({ data: [] });
    await add('Alpha');
    await screen.findByRole('button', { name: 'Add Beta' });
  });
  it('finds an unloaded category and pages its products independently of the initial catalog', async () => {
    const remoteProducts = ['Gamma', 'Delta'].map((name) => ({
      ...product(name),
      category_id: 'remote-category',
    }));
    api.products.mockImplementation(async (_ws, params) => ({
      data:
        params.categoryId === 'remote-category'
          ? [remoteProducts[params.page - 1]].filter(Boolean)
          : [],
      count: 2,
    }));
    api.prices.mockResolvedValue({
      as_of: new Date().toISOString(),
      data: remoteProducts.map((p) => ({
        id: `quote-${p.id}`,
        period_id: 'season',
        product_id: p.id,
        unit_id: 'unit',
        warehouse_id: 'warehouse',
        currency: 'VND',
        price: 60000,
        valid_from: '2000-01-01T00:00:00Z',
        valid_to: '2100-01-02T00:00:00Z',
      })),
    });
    mount(
      <SaleCreateDialog
        wsId="ws"
        workspaceCurrency="VND"
        products={products}
        periods={[period]}
        options={{
          ...options,
          defaultSalesPeriodId: period.id,
          categories: [
            { id: 'remote-category', name: 'Unloaded category', ws_id: 'ws' },
          ],
          warehouses: [
            { id: 'remote-warehouse', name: 'Unloaded warehouse', ws_id: 'ws' },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Filters and sorting' })
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Warehouse' }));
    expect(
      await screen.findByRole('option', { name: 'Unloaded warehouse' })
    ).toBeTruthy();
    fireEvent.keyDown(
      screen.getByRole('option', { name: 'Unloaded warehouse' }),
      { key: 'Escape' }
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Category' }));
    const categorySearch = screen.getByRole('combobox', {
      name: '',
      expanded: true,
    });
    fireEvent.change(categorySearch, { target: { value: 'Unloaded' } });
    fireEvent.click(
      await screen.findByRole('option', { name: 'Unloaded category' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Filters and sorting' })
    );
    await screen.findByRole('button', { name: 'Add Gamma' });
    expect(api.products).toHaveBeenCalledWith(
      'ws',
      expect.objectContaining({ categoryId: 'remote-category', page: 1 })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('button', { name: 'Add Delta' });
    expect(api.products).toHaveBeenLastCalledWith(
      'ws',
      expect.objectContaining({ categoryId: 'remote-category', page: 2 })
    );
  });
  it('clicking the selected row in the real period dropdown preserves cart and request identity', async () => {
    const uuid = vi.spyOn(crypto, 'randomUUID');
    openSale('scheduled');
    await add('Alpha');
    const requests = uuid.mock.calls.length;
    const dropdown = screen
      .getAllByRole('combobox')
      .find((element) => element.textContent?.includes('Current season'))!;
    fireEvent.click(dropdown);
    fireEvent.click(screen.getByRole('option', { name: 'Current season' }));
    expect(uuid.mock.calls.length).toBe(requests);
    uuid.mockRestore();
    review();
    await waitFor(() => expect(api.sale).toHaveBeenCalledTimes(1));
    expect(api.sale.mock.calls[0]?.[1].products).toEqual([
      expect.objectContaining({ product_id: 'Alpha', price: 60000 }),
    ]);
    expect(api.sale.mock.calls[0]?.[1].request_id).toBeTruthy();
  });
  it('disables an existing quoted cart when its scheduled period is archived', async () => {
    function Archivable() {
      const [status, setStatus] = useState<'active' | 'archived'>('active');
      return (
        <>
          <button type="button" onClick={() => setStatus('archived')}>
            Archive fixture season
          </button>
          <SaleCreateDialog
            wsId="ws"
            workspaceCurrency="VND"
            products={products}
            periods={[{ ...period, status }]}
            options={{ ...options, defaultSalesPeriodId: period.id }}
          />
        </>
      );
    }
    mount(<Archivable />);
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    await add('Alpha');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Archive fixture season',
        hidden: true,
      })
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Checkout/ }), {
      button: 0,
      ctrlKey: false,
    });
    const save = screen.getByRole('button', { name: 'Record sale' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    expect(api.sale).not.toHaveBeenCalled();
  });
  it('keeps centralized checkout edits across Back and preserves request identity on an uncertain retry', async () => {
    let fail!: (error: Error) => void;
    api.sale
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          })
      )
      .mockResolvedValue({ data: {} });
    mount(
      <SaleCreateDialog
        wsId="ws"
        workspaceCurrency="VND"
        products={products}
        periods={[{ ...period, pricing_mode: 'legacy' }]}
        options={{
          ...options,
          defaultSalesPeriodId: period.id,
          wallets: [
            ...(options.wallets ?? []),
            { id: 'other-wallet', name: 'Other wallet' },
          ],
          financeCategories: [
            ...options.financeCategories,
            { id: 'other-finance', name: 'Other revenue', ws_id: 'ws' },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    await add('Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      (screen.getByRole('button', { name: 'Record sale' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    expect(api.sale).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Sale name' }), {
      target: { value: 'Synthetic checkout' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Internal note' }), {
      target: { value: 'Synthetic note' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Revenue wallet' }));
    fireEvent.click(
      await screen.findByRole('option', { name: 'Other wallet' })
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Finance category' }));
    fireEvent.click(
      await screen.findByRole('option', { name: 'Other revenue' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Increase Alpha' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(
      screen.getByRole('button', { name: /^Revenue Other wallet/ })
    );
    expect(
      (screen.getByRole('textbox', { name: 'Sale name' }) as HTMLInputElement)
        .value
    ).toBe('Synthetic checkout');
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Internal note',
        }) as HTMLInputElement
      ).value
    ).toBe('Synthetic note');
    fireEvent.click(
      screen.getByRole('button', { name: /^Review Ready to confirm/ })
    );
    expect(screen.getByText('Synthetic checkout')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    await waitFor(() => expect(api.sale).toHaveBeenCalledTimes(1));
    expect(
      (
        screen.getByRole('button', {
          name: messages.inventory.operator.commerce.createSale.creating,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fail(new Error('Synthetic uncertain response'));
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Record sale',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    await waitFor(() => expect(api.sale).toHaveBeenCalledTimes(2));
    expect(api.sale.mock.calls[1]?.[1]).toEqual(api.sale.mock.calls[0]?.[1]);
    await screen.findByRole('button', { name: 'Add Alpha' });
    expect(
      screen
        .getByRole('checkbox', { name: 'Keep open' })
        .getAttribute('data-state')
    ).toBe('checked');
    expect(api.sale.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        content: 'Synthetic checkout',
        notes: 'Synthetic note',
        wallet_id: 'other-wallet',
        category_id: 'other-finance',
        request_id: expect.any(String),
        products: [expect.objectContaining({ quantity: 2 })],
      })
    );
  });

  it('keeps checkout usable when wallet options have not arrived', async () => {
    const { wallets: _wallets, ...withoutWallets } = options;
    mount(
      <SaleCreateDialog
        wsId="ws"
        workspaceCurrency="VND"
        products={products}
        periods={[{ ...period, pricing_mode: 'legacy', wallet_id: null }]}
        options={{ ...withoutWallets, defaultSalesPeriodId: period.id }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    await add('Alpha');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Checkout/ }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByRole('button', { name: /Revenue Choose a wallet/ })
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Record sale' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(api.sale).not.toHaveBeenCalled();
  });

  it('requires manual choice for an implicit legacy-only current period', async () => {
    mount(
      <SaleCreateDialog
        wsId="ws"
        workspaceCurrency="VND"
        products={products}
        periods={[{ ...period, pricing_mode: 'legacy' }]}
        options={options}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    expect(screen.queryByRole('button', { name: 'Add Alpha' })).toBeNull();
  });
  it('loads and selects a product past the first 50 rows in the actual price dialog', async () => {
    const catalog = Array.from({ length: 65 }, (_, i) =>
      product(`Design ${String(i + 1).padStart(2, '0')}`)
    );
    function Paginated() {
      const [count, setCount] = useState(50);
      return (
        <SeasonPricesDialog
          wsId="ws"
          period={period}
          products={catalog.slice(0, count)}
          hasNextProductsPage={count < 65}
          fetchNextProductsPage={() => setCount(65)}
        />
      );
    }
    mount(<Paginated />);
    fireEvent.click(screen.getByRole('button', { name: 'Season prices' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load more products' }));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(
      await screen.findByRole('option', { name: 'Design 65 · Item · Booth' })
    );
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '75000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.price).toHaveBeenCalledTimes(1));
    expect(api.price.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ product_id: 'Design 65', price: 75000 })
    );
  });
});
