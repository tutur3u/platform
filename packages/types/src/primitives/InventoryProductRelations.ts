import type { Tables } from '../supabase';

export type InventoryWarehouse = Pick<
  Tables<'inventory_warehouses'>,
  'id' | 'name'
>;
export type InventoryUnit = Pick<Tables<'inventory_units'>, 'id' | 'name'>;
export type InventoryProduct = Pick<
  Tables<'inventory_products'>,
  'amount' | 'min_amount' | 'price' | 'warehouse_id' | 'unit_id' | 'created_at'
> & {
  inventory_warehouses: InventoryWarehouse | null;
  inventory_units: InventoryUnit | null;
};
type InventoryProductCategory = Pick<Tables<'product_categories'>, 'name'>;
export type ProductStockChange = Pick<
  Tables<'product_stock_changes'>,
  'amount' | 'created_at' | 'warehouse_id'
> & {
  beneficiary: Pick<Tables<'workspace_users'>, 'full_name' | 'email'> | null;
  creator: Pick<Tables<'workspace_users'>, 'full_name' | 'email'> | null;
  warehouse?: {
    id: string;
    name: string;
  } | null;
};
export type RawInventoryProduct = Tables<'workspace_products'> & {
  product_categories?: InventoryProductCategory | null;
  inventory_products?: InventoryProduct[] | null;
};
export type RawInventoryProductWithChanges = Tables<'workspace_products'> & {
  inventory_products?: InventoryProduct[] | null;
  product_stock_changes?: ProductStockChange[] | null;
  product_categories?: InventoryProductCategory | null;
};
