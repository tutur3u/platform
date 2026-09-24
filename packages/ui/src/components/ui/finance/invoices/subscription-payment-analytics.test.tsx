import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionPaymentAnalytics } from './subscription-payment-analytics';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  chart: vi.fn(),
  userIds: ['u1'],
  walletIds: ['w1'],
}));
vi.mock('@tuturuuu/internal-api/finance-subscription-analytics', () => ({
  getSubscriptionPaymentAnalytics: mocks.get,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.count !== undefined ? `${key}:${values.count}` : key,
}));
vi.mock('nuqs', () => ({
  parseAsString: {},
  parseAsArrayOf: () => ({ withDefault: () => ({}) }),
  useQueryState: (key: string) => [
    key === 'userIds' ? mocks.userIds : mocks.walletIds,
  ],
}));
vi.mock('./charts/subscription-payment-chart', () => ({
  SubscriptionPaymentChart: (props: unknown) => {
    mocks.chart(props);
    return <div data-testid="payment-chart" />;
  },
}));
const metrics = {
  paidUsers: 2,
  paidGroups: 3,
  memberships: 4,
  invoiceCount: 5,
  amount: 1234,
};
const report = {
  year: 2026,
  granularity: 'monthly',
  unallocatedInvoices: 2,
  currencies: [
    {
      currency: 'VND',
      summary: metrics,
      periods: [{ period: '2026-01', ...metrics }],
      distribution: [{ groupCount: 2, userCount: 2 }],
    },
  ],
};
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SubscriptionPaymentAnalytics wsId="ws" currency="VND" />
    </QueryClientProvider>
  );
}
describe('tuition analytics interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noDocumentCookie: Reset the persisted visibility preference for each test.
    document.cookie = 'finance-confidential-mode=true;path=/';
    mocks.get.mockResolvedValue(report);
  });
  it('loads selected user and wallet filters and starts with hidden amounts', async () => {
    mount();
    await screen.findByText('unallocated:2');
    expect(mocks.get).toHaveBeenCalledWith(
      'ws',
      expect.objectContaining({
        granularity: 'monthly',
        userIds: ['u1'],
        walletIds: ['w1'],
      })
    );
    expect(screen.queryByText(/1,234/)).not.toBeInTheDocument();
    expect(screen.getAllByText('•••••').length).toBeGreaterThan(0);
    expect(mocks.chart).toHaveBeenLastCalledWith(
      expect.objectContaining({ hidden: true, metric: 'paidUsers' })
    );
  });
  it('switches coverage granularity and year', async () => {
    mount();
    await screen.findByTestId('payment-chart');
    fireEvent.click(screen.getByRole('button', { name: 'yearly' }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith(
        'ws',
        expect.objectContaining({ granularity: 'yearly' })
      )
    );
    fireEvent.change(screen.getByLabelText('ending_year'), {
      target: { value: '2025' },
    });
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith(
        'ws',
        expect.objectContaining({ year: 2025, granularity: 'yearly' })
      )
    );
  });
  it('switches the chart metric and reveals value only when requested', async () => {
    mount();
    await screen.findByTestId('payment-chart');
    fireEvent.click(screen.getByRole('button', { name: /amount/ }));
    expect(mocks.chart).toHaveBeenLastCalledWith(
      expect.objectContaining({ metric: 'amount', hidden: true })
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    expect(mocks.chart).toHaveBeenLastCalledWith(
      expect.objectContaining({ hidden: false })
    );
    expect(screen.getAllByText(/1,234/).length).toBeGreaterThan(0);
  });
  it('switches currencies without combining values', async () => {
    mocks.get.mockResolvedValue({
      ...report,
      currencies: [
        ...report.currencies,
        {
          ...report.currencies[0],
          currency: 'USD',
          summary: { ...metrics, amount: 99 },
        },
      ],
    });
    mount();
    await screen.findByLabelText('currency');
    fireEvent.change(screen.getByLabelText('currency'), {
      target: { value: 'USD' },
    });
    expect(mocks.chart).toHaveBeenLastCalledWith(
      expect.objectContaining({ currency: 'USD' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    expect(screen.getByText('$99.00')).toBeInTheDocument();
  });
  it('shows an error and supports retry', async () => {
    mocks.get.mockRejectedValueOnce(new Error('unavailable'));
    mount();
    await screen.findByRole('alert');
    expect(screen.queryByTestId('payment-chart')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await screen.findByTestId('payment-chart');
  });
  it('distinguishes unallocated legacy invoices from an empty exact-coverage report', async () => {
    mocks.get.mockResolvedValue({ ...report, currencies: [] });
    mount();
    await screen.findByText('empty');
    expect(screen.getByText('unallocated:2')).toBeInTheDocument();
    expect(screen.queryByTestId('payment-chart')).not.toBeInTheDocument();
  });
  it('exposes period values in an accessible table and group distribution', async () => {
    mount();
    await screen.findByText('table');
    fireEvent.click(screen.getByText('table'));
    await screen.findByRole('table');
    expect(
      screen.getByRole('rowheader', { name: '2026-01' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('distribution_value')).toBeInTheDocument();
  });
});
