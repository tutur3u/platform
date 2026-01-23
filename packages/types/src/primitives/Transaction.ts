export interface Transaction {
  id?: string;
  href?: string;
  amount?: number;
  description?: string;
  category_id?: string;
  category?: string;
  wallet_id?: string;
  wallet?: string;
  ws_id?: string;
  taken_at?: string;
  is_amount_confidential?: boolean;
  is_description_confidential?: boolean;
  is_category_confidential?: boolean;
  report_opt_in?: boolean;
  created_at?: string;
  user?: {
    full_name?: string;
    email?: string;
    avatar_url?: string;
  };
}
