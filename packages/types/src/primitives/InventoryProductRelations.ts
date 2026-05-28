import type { Database, Tables } from '../supabase';

type PrivateTable<TableName extends keyof Database['private']['Tables']> =
  Tables<{ schema: 'private' }, TableName>;

export type InventoryWarehouse = Pick<
  PrivateTable<'inventory_warehouses'>,
  'id' | 'name'
>;
export type InventoryUnit = Pick<
  PrivateTable<'inventory_units'>,
  'id' | 'name'
>;
export type InventoryManufacturer = Pick<
  PrivateTable<'inventory_manufacturers'>,
  'id' | 'name'
>;
export type InventoryProduct = Pick<
  PrivateTable<'inventory_products'>,
  'amount' | 'min_amount' | 'price' | 'warehouse_id' | 'unit_id' | 'created_at'
> & {
  inventory_warehouses: InventoryWarehouse | null;
  inventory_units: InventoryUnit | null;
};
type InventoryProductCategory = Pick<Tables<'product_categories'>, 'name'>;
type InventoryOwnerRelation = Pick<
  PrivateTable<'inventory_owners'>,
  'id' | 'name' | 'avatar_url' | 'linked_workspace_user_id'
>;
type InventoryFinanceCategoryRelation = Pick<
  Tables<'transaction_categories'>,
  'id' | 'name' | 'color' | 'icon'
>;
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
  inventory_manufacturers?: InventoryManufacturer | null;
  inventory_owners?: InventoryOwnerRelation | null;
  transaction_categories?: InventoryFinanceCategoryRelation | null;
  inventory_products?: InventoryProduct[] | null;
};
export type RawInventoryProductWithChanges = Tables<'workspace_products'> & {
  inventory_products?: InventoryProduct[] | null;
  product_stock_changes?: ProductStockChange[] | null;
  product_categories?: InventoryProductCategory | null;
  inventory_manufacturers?: InventoryManufacturer | null;
  inventory_owners?: InventoryOwnerRelation | null;
  transaction_categories?: InventoryFinanceCategoryRelation | null;
};
