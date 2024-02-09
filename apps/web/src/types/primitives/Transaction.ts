export interface Transaction {
  id?: string;
  amount?: number;
  description?: string;
  category_id?: string;
  wallet_id?: string;
  ws_id?: string;
  taken_at?: string | null;
  report_opt_in?: boolean;
  created_at?: string;
}
