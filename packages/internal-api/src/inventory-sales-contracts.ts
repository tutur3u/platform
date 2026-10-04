export type InventorySalesPeriodStatus = 'active' | 'archived';

export type InventorySalesPeriodProductScope =
  | 'all'
  | 'allowlist'
  | 'blocklist';

export type InventorySalesPeriod = {
  merged_into_id?: string | null;
  created_at: string;
  description: string | null;
  ends_at: string | null;
  id: string;
  name: string;
  product_ids: string[];
  product_scope: InventorySalesPeriodProductScope;
  sale_count: number;
  starts_at: string | null;
  status: InventorySalesPeriodStatus;
  updated_at: string;
  ws_id: string;
  pricing_mode?: 'legacy' | 'scheduled';
  time_zone?: string | null;
};

export type InventorySalesPeriodPayload = {
  pricing_mode?: 'legacy' | 'scheduled';
  time_zone?: string | null;
  description?: string | null;
  ends_at?: string | null;
  name: string;
  product_ids?: string[];
  product_scope?: InventorySalesPeriodProductScope;
  starts_at?: string | null;
};

export type InventorySaleCreatePayload = {
  category_id: string;
  content: string;
  notes?: string;
  period_id?: string | null;
  request_id?: string;
  products: Array<{
    category_id: string;
    price: number;
    price_id?: string;
    product_id: string;
    quantity: number;
    unit_id: string;
    warehouse_id: string;
  }>;
  wallet_id: string;
};
