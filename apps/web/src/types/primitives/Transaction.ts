export interface Transaction {
  id: string;
  name: string;
  amount: number;
  description?: string;
  category_id?: string;
  wallet_id?: string;
  taken_at?: string;
  created_at?: string;
}
