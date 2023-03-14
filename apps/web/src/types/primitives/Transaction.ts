export interface Transaction {
  id: string;
  name: string;
  amount: number;
  description?: string;
  // date: Date;
  created_at?: Date;
  wallet_id?: string;
}
