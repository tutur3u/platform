import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductSelection } from './product-selection';
import type { Product, SelectedProductItem } from './types';

const mocks = vi.hoisted(() => ({
  useFinanceConfidentialVisibility: vi.fn(() => ({
    isConfidential: true,
  })),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../shared/use-finance-confidential-visibility', () => ({
  FINANCE_HIDDEN_AMOUNT: '•••••',
  useFinanceConfidentialVisibility: (
    ...args: Parameters<typeof mocks.useFinanceConfidentialVisibility>
  ) => mocks.useFinanceConfidentialVisibility(...args),
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useFinanceConfidentialVisibility.mockReturnValue({
      isConfidential: true,
    });
  });

  it('masks selected invoice product prices when finance numbers are hidden', () => {
    render(
      <ProductSelection
        products={[product]}
        selectedProducts={selectedProducts}
        onSelectedProductsChange={vi.fn()}
        currency="VND"
      />
    );

    expect(
      screen.getAllByText((content) => content.includes('•••••')).length
    ).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/100.000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/50.000/)).not.toBeInTheDocument();
  });
});
