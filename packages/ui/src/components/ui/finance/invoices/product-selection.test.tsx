import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductSelection } from './product-selection';
import type { Product, SelectedProductItem } from './types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const product: Product = {
  category: null,
  category_id: 'category-1',
  created_at: null,
  description: null,
  id: 'product-1',
  inventory: [
    {
      amount: 5,
      min_amount: 1,
      price: 50000,
      unit_id: 'unit-1',
      unit_name: 'piece',
      warehouse_id: 'warehouse-1',
      warehouse_name: 'Main Warehouse',
    },
  ],
  manufacturer: null,
  name: 'Notebook',
  usage: null,
  ws_id: 'ws-1',
};

const selectedProducts: SelectedProductItem[] = [
  {
    inventory: product.inventory[0]!,
    product,
    quantity: 2,
  },
];

describe('ProductSelection', () => {
  it('keeps selected invoice product prices visible on creation flows', () => {
    render(
      <ProductSelection
        products={[product]}
        selectedProducts={selectedProducts}
        onSelectedProductsChange={vi.fn()}
        currency="VND"
      />
    );

    expect(screen.queryByText('•••••')).not.toBeInTheDocument();
    expect(
      screen.getAllByText((content) => /100[,.]000/.test(content)).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText((content) => /50[,.]000/.test(content)).length
    ).toBeGreaterThanOrEqual(1);
  });
});
