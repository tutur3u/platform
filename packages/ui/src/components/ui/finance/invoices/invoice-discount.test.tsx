import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceCheckoutSummary } from './components/invoice-checkout-summary';
import { getSavedInvoiceDiscount } from './invoice-discount';
import { FullInvoiceTemplate } from './invoiceId/full-invoice-template';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../shared/finance-display-amount', () => ({
  FinanceDisplayAmount: ({ value }: { value: string }) => <span>{value}</span>,
}));
vi.mock('@tuturuuu/utils/format', async (original) => ({
  ...(await original<typeof import('@tuturuuu/utils/format')>()),
  formatCurrency: (amount: number) => String(amount),
}));

const checkout = {
  subtotal: 100,
  totalBeforeRounding: 80,
  roundedTotal: 80,
  onRoundUp: vi.fn(),
  onRoundDown: vi.fn(),
  onResetRounding: vi.fn(),
  showRoundingControls: false,
};
const invoice = {
  id: 'invoice',
  price: 80,
  total_diff: 5,
  created_at: null,
  customer_full_name: 'Customer',
  customer_display_name: null,
  creator: { display_name: null, full_name: null },
  wallet: null,
} as ComponentProps<typeof FullInvoiceTemplate>['invoice'];
const products = [
  { price: 100, amount: 1, product_name: 'Item' },
] as ComponentProps<typeof FullInvoiceTemplate>['products'];

describe('invoice discount display', () => {
  it('shows a draft discount without a promotion label', () => {
    render(
      <InvoiceCheckoutSummary
        {...checkout}
        discountAmount={20}
        discountLabel={null}
      />
    );
    expect(screen.getByText('ws-invoices.discount')).toBeInTheDocument();
    expect(screen.getByText('-20')).toBeInTheDocument();
  });
  it('retains the computed draft discount while promotion metadata is unavailable', () => {
    render(<InvoiceCheckoutSummary {...checkout} />);
    expect(screen.getByText('-20')).toBeInTheDocument();
  });
  it('does not mistake rounding for a discount', () => {
    render(
      <InvoiceCheckoutSummary
        {...checkout}
        totalBeforeRounding={100}
        roundedTotal={95}
      />
    );
    expect(screen.queryByText('ws-invoices.discount')).not.toBeInTheDocument();
    expect(screen.getByText('ws-invoices.adjustment')).toBeInTheDocument();
  });
  it('shows the saved discount when the promotion link is absent', () => {
    render(
      <FullInvoiceTemplate
        invoice={invoice}
        products={products}
        promotions={[]}
        configs={[]}
        isDarkPreview
        lang="en"
      />
    );
    expect(screen.getByText('invoices.discounts:')).toBeInTheDocument();
    expect(screen.getByText('-20')).toBeInTheDocument();
  });
  it('uses the saved net price for capped fixed discounts rather than overclaiming the promotion value', () => {
    render(
      <FullInvoiceTemplate
        invoice={{ ...invoice, price: 0, total_diff: 0 }}
        products={products}
        promotions={[
          {
            promo_id: 'promo',
            name: 'Fixed',
            value: 150,
            use_ratio: false,
          } as ComponentProps<typeof FullInvoiceTemplate>['promotions'][number],
        ]}
        configs={[]}
        isDarkPreview
        lang="en"
      />
    );
    expect(screen.getByText('-100')).toBeInTheDocument();
    expect(screen.queryByText('-150')).not.toBeInTheDocument();
  });
  it('excludes saved rounding and rejects nonfinite or negative discounts', () => {
    expect(getSavedInvoiceDiscount(products, 80)).toBe(20);
    expect(getSavedInvoiceDiscount(products, 120)).toBe(0);
    expect(getSavedInvoiceDiscount(products, Number.NaN)).toBe(0);
  });
});
