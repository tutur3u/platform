export interface TransactionCategory {
  id: string;
  name: string;
  is_expense: boolean;
  ws_id?: string;
  created_at?: string;
}
