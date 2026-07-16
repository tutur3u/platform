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

export type InventoryCommerceTab = 'checkouts' | 'revenue-share' | 'sales';

export const UNASSIGNED_SALES_PERIOD_FILTER = '__unassigned__';

export type InventoryStockTab = 'stock' | 'warehouses';

export type InventoryFilters = {
  q: string;
  status: string;
};

export type InventoryStatusOption = {
  value: string;
  label: string;
};
