import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionPrepaidControls } from './subscription-prepaid-controls';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const messages: Record<string, string> = {
      'ws-invoices.coverage_range': 'Coverage',
      'ws-invoices.prepaid_month_count': 'Months to cover',
      'ws-invoices.prepaid_month_count_many': '{count} months',
      'ws-invoices.prepaid_month_count_one': '1 month',
      'ws-invoices.prepaid_months': 'Prepaid months',
      'ws-invoices.prepaid_months_description':
        'Choose how many months this subscription invoice should cover.',
      'ws-invoices.valid_until': 'Valid until',
    };

    return (messages[key] ?? key).replace(
      '{count}',
      String(values?.count ?? '')
    );
  },
}));

describe('SubscriptionPrepaidControls', () => {
  it('renders the prepaid count selector and coverage summary', () => {
    render(
      <SubscriptionPrepaidControls
        coverageRangeLabel="June 2026 - August 2026"
        prepaidMonthCount={3}
        validUntilLabel="September 2026"
        onPrepaidMonthCountChange={vi.fn()}
      />
    );

    expect(screen.getByText('Prepaid months')).toBeInTheDocument();
    expect(screen.getByText('Months to cover')).toBeInTheDocument();
    expect(screen.getByText('June 2026 - August 2026')).toBeInTheDocument();
    expect(screen.getByText('September 2026')).toBeInTheDocument();
  });
});
