import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StandardInvoiceTuitionWarning } from './standard-invoice-tuition-warning';

const pendingState = vi.hoisted(() => ({
  data: undefined as { data: Record<string, unknown>[] } | undefined,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('../../finance-route-context', () => ({
  useFinanceRoutePrefix: () => '/finance',
}));

vi.mock('../hooks', () => ({
  useInvoiceAttendanceConfig: () => ({ data: true }),
  usePendingInvoices: () => ({ data: pendingState.data }),
}));

describe('StandardInvoiceTuitionWarning', () => {
  beforeEach(() => {
    pendingState.data = undefined;
  });

  it('renders nothing while the customer owes no tuition', () => {
    pendingState.data = { data: [] };
    const { container } = render(
      <StandardInvoiceTuitionWarning userId="user-1" wsId="ws-1" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before pending tuition has loaded', () => {
    const { container } = render(
      <StandardInvoiceTuitionWarning userId="user-1" wsId="ws-1" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('warns and links to the class invoice for the owed range', () => {
    pendingState.data = {
      data: [
        {
          user_id: 'user-1',
          group_id: 'group-1',
          group_name: 'Class A',
          months_owed: ['2026-09', '2026-10', '2026-11'],
          attendance_days: 9,
          potential_total: 4_500_000,
        },
      ],
    };

    render(<StandardInvoiceTuitionWarning userId="user-1" wsId="ws-1" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText('ws-invoices.standard_invoice_tuition_owed_title')
    ).toBeInTheDocument();
    expect(screen.getByText('Class A · 2026-09 → 2026-11')).toBeInTheDocument();

    const link = screen.getByRole('link');
    const url = new URL(
      link.getAttribute('href') ?? '',
      'https://finance.test'
    );
    expect(url.pathname).toBe('/ws-1/finance/invoices/new');
    expect(url.searchParams.get('type')).toBe('subscription');
    expect(url.searchParams.get('user_id')).toBe('user-1');
    expect(url.searchParams.get('month')).toBe('2026-09');
    expect(url.searchParams.get('prepaid_month_count')).toBe('3');
    expect(url.searchParams.get('group_ids')).toBe('group-1');
  });

  it('ignores pending rows that belong to another customer', () => {
    pendingState.data = {
      data: [
        {
          user_id: 'someone-else',
          group_id: 'group-1',
          months_owed: ['2026-09'],
          attendance_days: 1,
          potential_total: 1,
        },
      ],
    };
    const { container } = render(
      <StandardInvoiceTuitionWarning userId="user-1" wsId="ws-1" />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
