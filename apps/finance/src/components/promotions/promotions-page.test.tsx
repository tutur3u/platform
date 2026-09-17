// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@tuturuuu/internal-api/finance', () => ({
  listFinancePromotions: mocks.list,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock(
  '@tuturuuu/ui/finance/shared/charts/use-finance-confidential-visibility',
  () => ({
    useFinanceConfidentialVisibility: () => ({ isConfidential: true }),
    FINANCE_HIDDEN_AMOUNT: '••••',
  })
);
vi.mock('@tuturuuu/ui/finance/invoices/promotion-form', () => ({
  PromotionForm: () => null,
}));

import { PromotionsPage } from './promotions-page';

const promo = {
  id: 'promo-1',
  name: 'Summer',
  code: 'SUMMER',
  value: 12.5,
  use_ratio: false,
  promo_type: 'REGULAR',
  current_uses: 3,
  max_uses: 10,
};
describe('Finance promotions page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ data: [promo], count: 21 });
  });
  it('pages on the server and respects read-only permissions and hidden amounts', async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <PromotionsPage
          wsId="ws-1"
          currency="USD"
          canCreate={false}
          canUpdate={false}
          canDelete={false}
        />
      </QueryClientProvider>
    );
    await screen.findByText('Summer');
    expect(screen.queryByRole('button', { name: 'create' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'edit Summer' })).toBeNull();
    expect(screen.getByText('••••')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith('ws-1', {
        q: '',
        page: 2,
        pageSize: 20,
      })
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'search' }), {
      target: { value: 'Summer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'search' }));
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith('ws-1', {
        q: 'Summer',
        page: 1,
        pageSize: 20,
      })
    );
  });
});
