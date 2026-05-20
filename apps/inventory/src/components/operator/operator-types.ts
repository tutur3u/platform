export type InventoryOperatorView =
  | 'audits'
  | 'bundles'
  | 'catalog'
  | 'checkouts'
  | 'overview'
  | 'sales'
  | 'setup'
  | 'stock'
  | 'storefront';

export type InventoryFilters = {
  q: string;
  status: string;
};

export type InventoryStatusOption = {
  value: string;
  label: string;
};
