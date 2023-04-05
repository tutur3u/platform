export interface Invoice {
  id: string;
  price?: number;
  price_diff?: number;
  note?: string;
  notice?: string;
  customer_id?: string;
  creator_id?: string;
  ws_id?: string;
  completed_at?: string;
  created_at?: string;
}
