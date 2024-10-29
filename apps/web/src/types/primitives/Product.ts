export interface Product {
  id: string;
  name?: string;
  manufacturer?: string;
  description?: string;
  usage?: string;
  stock?: number | string;
  amount?: number | string;
  price?: number | string;
  unit?: string;
  category?: string;
  category_id?: string;
  warehouse_id?: string;
  batch_id?: string;
  unit_id?: string;
  ws_id?: string;
  created_at?: string;
}
