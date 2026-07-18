import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SalesPeriodsPanel } from './sales-periods-panel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('SalesPeriodsPanel', () => {
  it('exposes editing for the selected period', () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SalesPeriodsPanel
          fetchNextProductsPage={() => undefined}
          hasNextProductsPage={false}
          isFetchingNextProductsPage={false}
          onSelect={() => undefined}
          periods={[
            {
              created_at: '2026-07-01T00:00:00.000Z',
              description: 'Convention sales',
              ends_at: '2026-07-31',
              id: 'period-1',
              name: 'TuCon 2026',
              product_ids: [],
              product_scope: 'all',
              sale_count: 4,
              starts_at: '2026-07-01',
              status: 'active',
              updated_at: '2026-07-01T00:00:00.000Z',
              ws_id: 'ws-1',
            },
          ]}
          products={[]}
          selectedPeriodId="period-1"
          wsId="ws-1"
        />
      </QueryClientProvider>
    );

    expect(html).toContain('edit');
    expect(html).toContain('archive');
    expect(html).toContain('sr-only sm:not-sr-only');
    expect(html).toContain('w-full min-w-0 flex-1');
  });
});
