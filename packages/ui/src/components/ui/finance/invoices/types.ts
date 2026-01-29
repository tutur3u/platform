export interface ProductInventory {
  unit_id: string;
  warehouse_id: string;
  amount: number | null;
  min_amount: number;
  price: number;
  unit_name: string | null;
  warehouse_name: string | null;
}

export interface Product {
  id: string;
  name: string | null;
  manufacturer: string | null;
  description: string | null;
  usage: string | null;
  category: string | null;
  category_id: string;
  ws_id: string;
  created_at: string | null;
  inventory: ProductInventory[];
}

export interface SelectedProductItem {
  product: Product;
  inventory: ProductInventory;
  quantity: number;
}

// Add interface for group products to work with ProductSelection
export interface GroupProductItem {
  workspace_products: {
    id: string;
    name: string | null;
    manufacturer: string | null;
    description: string | null;
    usage: string | null;
    category_id: string;
    ws_id: string;
    created_at: string | null;
    product_categories?: {
      name: string;
    } | null;
  };
  inventory_units: {
    name: string;
  } | null;
}

export interface Promotion {
  id: string;
  name: string | null;
  code: string | null;
  value: number;
  use_ratio: boolean;
  ws_id: string;
  created_at: string;
  creator_id: string | null;
  description: string | null;
}

export interface UserGroupProducts {
  group_id?: string;
  workspace_user_groups?: {
    name: string | null;
  };
  workspace_products: {
    id: string;
    name: string | null;
    product_categories: {
      name: string | null;
    };
  };
  inventory_units: {
    name: string | null;
    id: string;
  };
  warehouse_id: string | null;
}
