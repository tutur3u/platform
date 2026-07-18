import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SaleRows } from './commerce-rows';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

describe('SaleRows mobile presentation', () => {
  it('keeps selection desktop-only and surfaces compact sale metadata', () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SaleRows
          fetchNextPage={() => undefined}
          financeCategories={[]}
          hasNextPage={false}
          isFetchingNextPage={false}
          periods={[]}
          products={[]}
          query=""
          rows={[
            {
              completed_at: '2026-07-18T13:03:00.000Z',
              created_at: '2026-07-18T13:03:00.000Z',
              creator_name: 'Fenrys & Morris',
              currency: 'VND',
              customer_name: null,
              id: 'sale-1',
              items_count: 1,
              notice: 'In-person inventory sale',
              owners: ['Shen'],
              paid_amount: 180_000,
              source: 'finance_invoice',
              total_quantity: 1,
              wallet_name: 'Cash',
            },
          ]}
          saleCategory=""
          saleCreator=""
          saleSort="date-desc"
          saleWarehouse=""
          wallets={[{ id: 'wallet-1', name: 'Cash' }]}
          workspaceCurrency="VND"
          wsId="ws-1"
        />
      </QueryClientProvider>
    );

    expect(html).toContain('hidden min-w-0 flex-wrap');
    expect(html).toContain('mt-1 hidden sm:flex');
    expect(html).toContain('commerce.creatorLabel: Fenrys &amp; Morris');
    expect(html).toContain('commerce.ownersLabel: Shen');
    expect(html).toContain('commerce.walletLabel: Cash');
    expect(html).toContain('commerce.amountDetails:');
  });
});
