import { describe, expect, it, vi } from 'vitest';
import {
  getInventoryQueryState,
  type InventoryQueryInputs,
} from './inventory-query-state';

function inputs(): InventoryQueryInputs {
  const ready = {
    data: {},
    isError: false,
    isFetching: false,
    isPending: false,
    refetch: vi.fn(),
  };
  return {
    overview: ready,
    products: ready,
    categories: ready,
    storefronts: ready,
    bundles: ready,
    checkouts: ready,
    sales: ready,
    commerceSummary: ready,
    salesPeriods: ready,
    periodProducts: ready,
    formOptions: ready,
    revenueShares: ready,
    promotions: ready,
    costingProfiles: ready,
    costingAnalytics: ready,
    audits: ready,
    suppliers: ready,
    batches: ready,
  };
}

function pending(data: InventoryQueryInputs, key: keyof InventoryQueryInputs) {
  data[key] = { ...data[key], data: undefined, isPending: true };
}

describe('operator query state', () => {
  it('keeps sales loading until every checkout prerequisite is available', () => {
    for (const key of [
      'sales',
      'salesPeriods',
      'commerceSummary',
      'periodProducts',
      'formOptions',
    ] as const) {
      const data = inputs();
      pending(data, key);
      const result = getInventoryQueryState(data, 'sales', 'products', 'sales');
      expect(result.isLoading).toBe(true);
      expect(result.commerceLoading).toBe(true);
    }
  });

  it('preserves cached sales during background refresh', () => {
    const data = inputs();
    data.sales = { ...data.sales, isPending: true, isFetching: true };
    const result = getInventoryQueryState(data, 'sales', 'products', 'sales');
    expect(result.isLoading).toBe(false);
    expect(result.commerceLoading).toBe(false);
    expect(result.activeQueries.some((query) => query.isFetching)).toBe(true);
  });

  it('ignores inactive query errors and pending states', () => {
    const data = inputs();
    data.revenueShares = {
      ...data.revenueShares,
      data: undefined,
      isPending: true,
      isError: true,
    };
    expect(
      getInventoryQueryState(data, 'sales', 'products', 'sales')
    ).toMatchObject({
      isLoading: false,
      isError: false,
      commerceLoading: false,
    });
  });

  it('retains retry callbacks for active errors', () => {
    const data = inputs();
    const refetch = vi.fn();
    data.salesPeriods = { ...data.salesPeriods, isError: true, refetch };
    const result = getInventoryQueryState(data, 'sales', 'products', 'sales');
    expect(result.isError).toBe(true);
    result.activeQueries.find((query) => query.isError)?.refetch();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('loads cart prerequisites independently of the sales ledger', () => {
    const data = inputs();
    pending(data, 'sales');
    expect(
      getInventoryQueryState(data, 'commerce', 'products', 'cart')
        .commerceLoading
    ).toBe(false);
    pending(data, 'formOptions');
    expect(
      getInventoryQueryState(data, 'commerce', 'products', 'cart')
        .commerceLoading
    ).toBe(true);
  });

  it('selects checkout and revenue-share loading by the active tab', () => {
    const data = inputs();
    pending(data, 'checkouts');
    expect(
      getInventoryQueryState(data, 'commerce', 'products', 'checkouts')
        .commerceLoading
    ).toBe(true);
    expect(
      getInventoryQueryState(data, 'commerce', 'products', 'revenue-share')
        .commerceLoading
    ).toBe(false);
    pending(data, 'revenueShares');
    expect(
      getInventoryQueryState(data, 'commerce', 'products', 'revenue-share')
        .commerceLoading
    ).toBe(true);
  });

  it('uses category loading without waiting for inactive product queries', () => {
    const data = inputs();
    pending(data, 'products');
    expect(
      getInventoryQueryState(data, 'catalog', 'categories', 'checkouts')
        .isLoading
    ).toBe(false);
    pending(data, 'categories');
    expect(
      getInventoryQueryState(data, 'catalog', 'categories', 'checkouts')
        .isLoading
    ).toBe(true);
  });
});
