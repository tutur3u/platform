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
  report_opt_in?: boolean;
  created_at?: string;
}
