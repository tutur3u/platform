export interface TransactionTag {
  id: string;
  name: string;
  color: string;
}

export interface Transaction {
  id?: string;
  href?: string;
  amount?: number;
  description?: string;
  category_id?: string;
  category?: string;
  category_icon?: string | null;
  category_color?: string | null;
  wallet_id?: string;
  wallet?: string;
  wallet_currency?: string;
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
  tags?: TransactionTag[];
  transfer?: {
    linked_transaction_id: string;
    linked_wallet_id: string;
    linked_wallet_name: string;
    linked_wallet_currency?: string;
    linked_amount?: number;
    is_origin: boolean;
  };
}
