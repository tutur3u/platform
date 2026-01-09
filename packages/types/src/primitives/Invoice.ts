export interface Invoice {
  id: string;
  price?: number;
  total_diff?: number;
  note?: string;
  notice?: string;
  customer_id?: string;
  creator_id?: string;
  platform_creator_id?: string;
  ws_id?: string;
  completed_at?: string;
  transaction_id?: string;
  created_at?: string;
  href?: string;
}
