export interface WalletTransfer {
  from_transaction_id: string;
  to_transaction_id: string;
  origin_wallet_id?: string;
  destination_wallet_id?: string;
  created_at?: string;
}
