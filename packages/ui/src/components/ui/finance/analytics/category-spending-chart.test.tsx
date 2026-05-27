import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategorySpendingChart } from './category-spending-chart';

const mocks = vi.hoisted(() => ({
  getCategoryBreakdown: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  getCategoryBreakdown: (
    ...args: Parameters<typeof mocks.getCategoryBreakdown>
  ) => mocks.getCategoryBreakdown(...args),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderCategorySpendingChart() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <CategorySpendingChart currency="USD" wsId="ws-1" />
    </QueryClientProvider>
  );
}

describe('CategorySpendingChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    mocks.getCategoryBreakdown.mockResolvedValue([
      { category_name: 'Food', total: 75 },
      { category_name: 'Transport', total: 25 },
    ]);
  });

  it('masks category percentages when finance numbers are hidden', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=true;path=/';

    renderCategorySpendingChart();

    expect(await screen.findByText('Food')).toBeVisible();
    expect(screen.getAllByText('•••••').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('75.0%')).not.toBeInTheDocument();
    expect(screen.queryByText('25.0%')).not.toBeInTheDocument();
    expect(screen.queryByText('$75.00')).not.toBeInTheDocument();
  });

  it('shows category percentages when finance numbers are visible', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/';

    renderCategorySpendingChart();

    expect(await screen.findByText('Food')).toBeVisible();
    expect(screen.getByText('75.0%')).toBeVisible();
    expect(screen.getByText('25.0%')).toBeVisible();
    expect(screen.getByText('$75.00')).toBeVisible();
  });
});
