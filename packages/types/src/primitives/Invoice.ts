export interface Invoice {
  id: string;
  price?: number;
  total_diff?: number;
  note?: string;
  notice?: string;
  customer_id?: string;
  customer?: {
    full_name?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  creator_id?: string;
  creator?: {
    id: string;
    full_name?: string | null;
    display_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
  platform_creator_id?: string;
  ws_id?: string;
  completed_at?: string;
  transaction_id?: string;
  created_at?: string;
  href?: string;
}
