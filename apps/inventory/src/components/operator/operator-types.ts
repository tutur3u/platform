export type InventoryOperatorView =
  | 'audits'
  | 'bundles'
  | 'catalog'
  | 'commerce'
  | 'costing'
  | 'overview'
  | 'setup'
  | 'stock'
  | 'storefront';

export type InventoryCommerceTab = 'checkouts' | 'promotions' | 'sales';

export type InventoryFilters = {
  q: string;
  status: string;
};

export type InventoryStatusOption = {
  value: string;
  label: string;
};
