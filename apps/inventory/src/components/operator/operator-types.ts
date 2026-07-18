export type InventoryOperatorView =
  | 'audits'
  | 'bundles'
  | 'catalog'
  | 'commerce'
  | 'costing'
  | 'overview'
  | 'payments'
  | 'promotions'
  | 'setup'
  | 'stock'
  | 'storefront';

export type InventoryCommerceTab =
  | 'cart'
  | 'checkouts'
  | 'revenue-share'
  | 'sales';

export type InventoryCatalogTab = 'categories' | 'products';

export const UNASSIGNED_SALES_PERIOD_FILTER = '__unassigned__';

export type InventoryStockTab = 'stock' | 'warehouses';

export type InventoryFilters = {
  productCategory: string;
  productOwner: string;
  productSort: string;
  productWarehouse: string;
  q: string;
  saleCategory: string;
  saleCreator: string;
  saleSort: string;
  saleWarehouse: string;
  status: string;
};

export type InventoryStatusOption = {
  value: string;
  label: string;
};
