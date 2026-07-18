import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CommercePanel } from './commerce-panel';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

describe('CommercePanel', () => {
  it('keeps commerce tabs visible while the active tab is loading locally', () => {
    const html = renderToStaticMarkup(
      <CommercePanel
        checkouts={[]}
        fetchNextProductsPage={() => undefined}
        fetchNextSalesPage={() => undefined}
        filters={{
          productCategory: '',
          productOwner: '',
          productSort: 'created-desc',
          productWarehouse: '',
          q: '',
          saleCategory: '',
          saleCreator: '',
          saleSort: 'date-desc',
          saleWarehouse: '',
          status: 'all',
        }}
        hasNextProductsPage={false}
        hasNextSalesPage={false}
        isFetchingNextProductsPage={false}
        isFetchingNextSalesPage={false}
        isLoading
        products={[]}
        query=""
        revenueShares={[]}
        sales={[]}
        salesCount={0}
        salesPeriods={[]}
        selectedPeriodId=""
        setPeriodId={() => undefined}
        setFilters={() => undefined}
        setTab={() => undefined}
        tab="sales"
        wsId="ws-1"
      />
    );

    expect(html).toContain('checkouts');
    expect(html).toContain('cart');
    expect(html).toContain('sales');
    expect(html).not.toContain('promotions');
    expect(html).toContain('revenueShare');
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('emptyDescriptions.sales');
  });
});
