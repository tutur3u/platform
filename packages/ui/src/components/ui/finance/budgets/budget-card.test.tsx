import { render, screen } from '@testing-library/react';
import type { FinanceBudget } from '@tuturuuu/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetCard } from './budget-card';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key}:${values.name}` : key,
}));

const budget = {
  id: 'budget-1',
  name: 'Dining',
  description: null,
  amount: 1000,
  spent: 250,
  period: 'monthly',
  start_date: '2026-05-01',
  end_date: null,
  alert_threshold: 80,
  category_id: null,
  wallet_id: null,
  ws_id: 'ws-1',
} as FinanceBudget;

function renderBudgetCard() {
  return render(
    <BudgetCard
      budget={budget}
      currency="USD"
      deletingId={null}
      locale="en-US"
      onDelete={vi.fn()}
      onEdit={vi.fn()}
    />
  );
}

describe('BudgetCard', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;Secure';
  });

  it('masks budget amounts, usage percentage, and progress when finance numbers are hidden', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=true;path=/;Secure';

    const { container } = renderBudgetCard();

    expect(screen.getAllByText('•••••').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('25.0%')).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="progress-indicator"]')
    ).toHaveStyle('transform: translateX(-100%)');
  });

  it('shows budget amounts, usage percentage, and progress when finance numbers are visible', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/;Secure';

    const { container } = renderBudgetCard();

    expect(screen.getByText('$250.00')).toBeVisible();
    expect(screen.getByText('$1,000.00')).toBeVisible();
    expect(screen.getByText('25.0%')).toBeVisible();
    expect(
      container.querySelector('[data-slot="progress-indicator"]')
    ).toHaveStyle('transform: translateX(-75%)');
  });
});
