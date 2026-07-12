import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionInvoiceProposal } from './subscription-invoice-proposal';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock('../../shared/finance-display-amount', () => ({
  FinanceDisplayAmount: ({ value }: { value: string }) => <span>{value}</span>,
}));

describe('SubscriptionInvoiceProposal', () => {
  it('shows the suggested total and billable quantity before products load', () => {
    render(
      <SubscriptionInvoiceProposal
        billableQuantity={3}
        currency="VND"
        currentTotal={0}
        hasSelectedProducts={false}
        suggestedTotal={1_500_000}
      />
    );

    expect(screen.getByText(/1[,.]500[,.]000/)).toBeInTheDocument();
    expect(
      screen.getByText(/based_on_billable_quantity.*"count":3/)
    ).toBeInTheDocument();
    expect(
      screen.getByText('ws-invoices.suggested_total_requires_products')
    ).toBeInTheDocument();
  });

  it('warns when selected products calculate a different total', () => {
    render(
      <SubscriptionInvoiceProposal
        currency="VND"
        currentTotal={1_200_000}
        hasSelectedProducts
        suggestedTotal={1_500_000}
      />
    );

    expect(
      screen.getByText(/ws-invoices.suggested_total_mismatch/)
    ).toBeInTheDocument();
  });
});
