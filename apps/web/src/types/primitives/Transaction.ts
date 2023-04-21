export interface Transaction {
  id?: string;
  amount?: number;
  description?: string;
  category_id?: string;
  wallet_id?: string;
  taken_at?: string | null;
  created_at?: string;
}
