import type { Database } from '@tuturuuu/types';
import type { TransactionFormValues } from './form-schema';

type DbTransaction = Database['public']['Tables']['wallet_transactions']['Row'];
type DbTransactionCategory =
  Database['public']['Tables']['transaction_categories']['Row'];
type DbWallet = Database['public']['Tables']['workspace_wallets']['Row'];
type DbTag = Database['public']['Tables']['transaction_tags']['Row'];

export type Transaction = DbTransaction & {
  transfer?: {
    linked_transaction_id: string;
    linked_wallet_id: string;
    linked_wallet_name: string;
    linked_wallet_currency?: string;
    linked_amount?: number;
    is_origin: boolean;
  };
};

export type TransactionCategory = DbTransactionCategory;
export type Wallet = DbWallet;
export type TagDraft = Pick<DbTag, 'name'> & Partial<Pick<DbTag, 'color'>>;

export interface TransactionFormProps {
  wsId: string;
  data?: Transaction;
  onFinish?: (data: TransactionFormValues) => void;
  canCreateTransactions?: boolean;
  canUpdateTransactions?: boolean;
  canCreateConfidentialTransactions?: boolean;
  canUpdateConfidentialTransactions?: boolean;
}

export type NewContentType = 'wallet' | 'transaction-category' | 'tag';

export type NewContent = Wallet | TransactionCategory | TagDraft | undefined;
