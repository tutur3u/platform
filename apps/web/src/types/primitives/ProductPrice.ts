export interface ProductPrice {
  product_id: string;
  product_name?: string;
  unit_id: string;
  unit_name?: string;
  warehouse_id?: string;
  warehouse_name?: string;
  price: number | null;
  amount: number | null;
  min_amount?: number | null;
  created_at?: string;
}
