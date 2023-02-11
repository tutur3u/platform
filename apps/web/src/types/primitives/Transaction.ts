export interface Transaction {
  id: string;
  name: string;
  amount: number;
  description?: string;
  created_at?: Date;
  wallet_id?: string;
}
