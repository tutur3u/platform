import { render, screen, waitFor } from '@testing-library/react';
import type { InvoiceTotalsByGroup } from '@tuturuuu/types/primitives/Invoice';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceTotalsChart } from './invoice-totals-chart';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

const invoiceData = [
  {
    period: '2026-05-01',
    group_id: 'wallet-1',
    group_name: 'Cash',
    group_avatar_url: null,
    total_amount: 100,
    invoice_count: 3,
  },
] satisfies InvoiceTotalsByGroup[];

function renderInvoiceTotalsChart() {
  return render(
    <InvoiceTotalsChart
      dailyCreatorData={[]}
      dailyWalletData={invoiceData}
      hasDateRange={false}
      monthlyCreatorData={[]}
      monthlyWalletData={[]}
      period="daily"
      setPeriod={vi.fn()}
      weeklyCreatorData={[]}
      weeklyWalletData={[]}
    />
  );
}

describe('InvoiceTotalsChart', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  });

  it('masks invoice count totals when finance numbers are hidden', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=true;path=/';

    renderInvoiceTotalsChart();

    expect(screen.getAllByText('•••').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('3 invoices')).not.toBeInTheDocument();
  });

  it('shows invoice count totals when finance numbers are visible', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/';

    renderInvoiceTotalsChart();

    await waitFor(() => expect(screen.getByText('3 invoices')).toBeVisible());
  });
});
