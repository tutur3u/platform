import { describe, expect, it } from 'vitest';
import {
  getInventorySearchStatus,
  getInventoryStatuses,
  getInventoryTabs,
} from './inventory-operator-view';
import type { useInventorySearchResults } from './use-inventory-search-results';

describe('inventory view selection', () => {
  it('keeps standalone sales pinned despite stale URL tabs', () => {
    expect(getInventoryTabs('sales', 'cart').commerceTab).toBe('sales');
    expect(getInventoryTabs('commerce', 'sales').commerceTab).toBe('checkouts');
    expect(getInventoryTabs('catalog', 'unknown').catalogTab).toBe('products');
    expect(getInventoryTabs('catalog', 'categories').catalogTab).toBe(
      'categories'
    );
  });
  it('does not offer checkout statuses on cart or standalone sales', () => {
    expect(getInventoryStatuses('commerce', 'checkouts')).toEqual([
      'all',
      'reserved',
      'completed',
    ]);
    expect(getInventoryStatuses('commerce', 'cart')).toEqual(['all']);
    expect(getInventoryStatuses('sales', 'sales')).toEqual(['all']);
    expect(getInventoryStatuses('storefront', 'checkouts')).toEqual([
      'all',
      'draft',
      'published',
      'paused',
    ]);
  });
  it('selects the active query status without conflating category/product or commerce tabs', () => {
    const search = Object.fromEntries(
      [
        'categorySearch',
        'productSearch',
        'checkoutSearch',
        'revenueShareSearch',
        'saleSearch',
      ].map((key) => [key, { status: { cachedCount: key } }])
    ) as unknown as ReturnType<typeof useInventorySearchResults>;
    expect(
      getInventorySearchStatus('catalog', 'categories', 'checkouts', search)
    ).toBe(search.categorySearch.status);
    expect(
      getInventorySearchStatus('commerce', 'products', 'revenue-share', search)
    ).toBe(search.revenueShareSearch.status);
    expect(
      getInventorySearchStatus('commerce', 'products', 'cart', search)
    ).toBe(search.productSearch.status);
    expect(getInventorySearchStatus('sales', 'products', 'sales', search)).toBe(
      search.saleSearch.status
    );
  });
});
