'use client';

import { useMemo } from 'react';
import { matchesHybridSearch } from './hybrid-search';
import { filterInventoryProducts } from './product-filters';
import { useHybridSearchResults } from './use-hybrid-search-results';
import type { useInventoryData } from './use-inventory-data';

export function useInventorySearchResults(
  data: ReturnType<typeof useInventoryData>
) {
  const loadedProducts =
    data.products.data?.pages.flatMap((page) => page.data) ?? [];
  const productSearch = useHybridSearchResults({
    getId: (product) => product.id,
    isFetching: data.products.isFetching,
    query: data.filters.q,
    queryKey: data.searchKeys.products,
    serverQuery: data.serverQuery,
    visibleItems: loadedProducts,
  });
  const products = useMemo(
    () =>
      filterInventoryProducts(productSearch.results, {
        ownerId: data.filters.productOwner,
        warehouseId: data.filters.productWarehouse,
      }),
    [
      data.filters.productOwner,
      data.filters.productWarehouse,
      productSearch.results,
    ]
  );
  const categorySearch = useHybridSearchResults({
    getId: (category) => category.id,
    isFetching: data.categories.isFetching,
    query: data.filters.q,
    queryKey: data.searchKeys.categories,
    serverQuery: data.serverQuery,
    visibleItems:
      data.categories.data?.pages.flatMap((page) => page.data) ?? [],
  });
  const storefrontSearch = useHybridSearchResults({
    getId: (storefront) => storefront.id,
    isFetching: data.storefronts.isFetching,
    query: data.filters.q,
    queryKey: data.searchKeys.storefronts,
    serverQuery: data.serverQuery,
    visibleItems: data.storefronts.data?.data ?? [],
  });
  const bundleSearch = useHybridSearchResults({
    getId: (bundle) => bundle.id,
    isFetching: data.bundles.isFetching,
    query: data.filters.q,
    queryKey: data.searchKeys.bundles,
    serverQuery: data.serverQuery,
    visibleItems: data.bundles.data?.data ?? [],
  });
  const saleSearch = useHybridSearchResults({
    getId: (sale) => `${sale.source}:${sale.id}`,
    isFetching: data.sales.isFetching,
    query: data.filters.q,
    queryKey: data.searchKeys.sales,
    serverQuery: data.serverQuery,
    visibleItems: data.sales.data?.pages.flatMap((page) => page.data) ?? [],
  });
  const checkoutSearch = useHybridSearchResults({
    getId: (checkout) => checkout.id,
    isFetching: data.checkouts.isFetching,
    query: data.filters.q,
    queryKey: data.searchKeys.checkouts,
    serverQuery: data.serverQuery,
    visibleItems: data.checkouts.data?.data ?? [],
  });
  const costingSearch = useHybridSearchResults({
    getId: (profile) => profile.id,
    isFetching: data.costingProfiles.isFetching,
    query: data.filters.q,
    queryKey: data.searchKeys.costingProfiles,
    serverQuery: data.serverQuery,
    visibleItems: data.costingProfiles.data?.data ?? [],
  });
  const promotionSearch = useHybridSearchResults({
    getId: (promotion) =>
      String(promotion.id ?? promotion.code ?? promotion.name),
    isFetching: data.promotions.isFetching,
    query: data.filters.q,
    queryKey: data.searchKeys.promotions,
    serverQuery: data.serverQuery,
    visibleItems: data.promotions.data?.data ?? [],
  });
  const revenueShareSearch = useHybridSearchResults({
    getId: (earning) => earning.partnerId,
    isFetching: data.revenueShares.isFetching,
    query: data.filters.q,
    queryKey: data.searchKeys.revenueShares,
    serverQuery: data.serverQuery,
    visibleItems: data.revenueShares.data?.data ?? [],
  });
  const suppliers = data.suppliers.data?.data ?? [];
  const batches = data.batches.data?.data ?? [];
  const setupSearchCount = [
    ...(data.formOptions.data?.owners ?? []),
    ...(data.formOptions.data?.manufacturers ?? []),
    ...(data.formOptions.data?.units ?? []),
    ...(data.formOptions.data?.warehouses ?? []),
    ...suppliers,
    ...batches,
  ].filter((item) => matchesHybridSearch(item, data.filters.q)).length;

  return {
    batches,
    bundleSearch,
    categorySearch,
    checkoutSearch,
    costingSearch,
    periodProducts:
      data.periodProducts.data?.pages.flatMap((page) => page.data) ?? [],
    productSearch,
    products,
    promotionSearch,
    revenueShareSearch,
    sales: saleSearch.results,
    saleSearch,
    setupSearchCount,
    storefrontSearch,
    suppliers,
  };
}
