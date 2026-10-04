import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CommercePanel } from './commerce-panel';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('./sales-periods-panel', () => ({
  SalesPeriodsPanel: ({ canMerge }: { canMerge: boolean }) => (
    <div data-merge-permitted={String(canMerge)} />
  ),
}));
vi.mock('./sale-create-dialog', () => ({ SaleCreateDialog: () => null }));
vi.mock('./profit-summary-panel', () => ({ ProfitSummaryPanel: () => null }));
vi.mock('./commerce-rows', () => ({
  CheckoutRows: () => null,
  SaleRows: () => null,
}));
vi.mock('./operator-advanced-filters', () => ({
  OperatorAdvancedFilters: () => null,
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
        tab="checkouts"
        wsId="ws-1"
      />
    );

    expect(html).toContain('checkouts');
    expect(html).toContain('cart');
    expect(html).not.toContain('trigger-sales');
    expect(html).not.toContain('promotions');
    expect(html).toContain('revenueShare');
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('emptyDescriptions.sales');
  });
  it.each([
    [undefined, false],
    [false, false],
    [true, true],
  ])(
    'keeps merge permission fail-closed for %s',
    (canMergeSeasons, permitted) => {
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
          standaloneSales
          canMergeSeasons={canMergeSeasons}
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
      expect(html).toContain(`data-merge-permitted="${permitted}"`);
    }
  );
});
