import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OperatorDialogTabs } from './operator-dialog-shell';
import {
  getSaleStockOptions,
  type SaleCartLine,
  updateSaleCartQuantity,
} from './sale-create-items';
import { SaleProductPicker } from './sale-product-picker';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    `${key}${values?.name ? ` ${values.name}` : ''}`,
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('renders one cart control per stock identity inside the remaining-height scroll chain', () => {
  const product = {
    id: 'synthetic-product',
    name: 'Synthetic product',
    inventory: [
      { unit_id: 'unit', warehouse_id: 'counter', price: 4, amount: 3 },
      { unit_id: 'unit', warehouse_id: 'counter', price: 4, amount: 3 },
      { unit_id: 'pack', warehouse_id: 'counter', price: 12, amount: null },
    ],
  };
  const options = getSaleStockOptions([product, product]);
  function Harness() {
    const [lines, setLines] = useState<SaleCartLine[]>([]);
    const [tab, setTab] = useState('items');
    return (
      <OperatorDialogTabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          {
            value: 'items',
            label: 'Items',
            contentClassName: 'flex flex-col overflow-hidden',
            content: (
              <SaleProductPicker
                categoryFilter=""
                categories={[]}
                hasNextPage={false}
                isFetchingNextPage={false}
                isRefreshing={false}
                lines={lines}
                options={options}
                query=""
                serverResultCount={1}
                sort="name-asc"
                warehouseFilter=""
                warehouses={[]}
                workspaceCurrency="USD"
                showUnitOnMobile
                showWarehouseOnMobile
                onCategoryFilterChange={() => {}}
                onQueryChange={() => {}}
                onSortChange={() => {}}
                onWarehouseFilterChange={() => {}}
                onQuantityChange={(option, quantity) =>
                  setLines((current) =>
                    updateSaleCartQuantity(current, option, quantity)
                  )
                }
              />
            ),
          },
          { value: 'payment', label: 'Payment', content: <p>Payment</p> },
        ]}
      />
    );
  }
  act(() => root.render(<Harness />));
  const picker = container.querySelector('section')!;
  const tab = picker.parentElement!;
  const list = picker.lastElementChild!;
  expect(tab.classList.contains('flex')).toBe(true);
  expect(tab.classList.contains('min-h-0')).toBe(true);
  expect(tab.classList.contains('overflow-hidden')).toBe(true);
  expect(picker.classList.contains('flex-1')).toBe(true);
  expect(picker.classList.contains('min-h-0')).toBe(true);
  expect(list.classList.contains('flex-1')).toBe(true);
  expect(list.classList.contains('min-h-0')).toBe(true);
  expect(list.classList.contains('overflow-y-auto')).toBe(true);
  expect(list.className).not.toContain('max-h-');
  expect(list.children).toHaveLength(2);
  const add = list.querySelector<HTMLButtonElement>(
    'button[aria-label="addItem Synthetic product"]'
  )!;
  act(() => add.click());
  const increase = list.querySelector<HTMLButtonElement>(
    'button[aria-label="increaseItem Synthetic product"]'
  )!;
  act(() => increase.click());
  expect(list.querySelectorAll('[title="cartQuantity"]')).toHaveLength(1);
  expect(list.querySelector('[title="cartQuantity"]')?.textContent).toBe('2');
  expect(
    list.querySelectorAll('button[aria-label="addItem Synthetic product"]')
  ).toHaveLength(1);
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[role="tab"][data-state="inactive"]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
  );
  const payment = container.querySelector(
    '[role="tabpanel"][data-state="active"]'
  )!;
  expect(payment.classList.contains('overflow-y-auto')).toBe(true);
  expect(payment.classList.contains('overflow-hidden')).toBe(false);
});
