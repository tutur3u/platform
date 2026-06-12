import type { Database } from '@tuturuuu/types';
import type { FinancePermissionRequestUser } from '../shared/finance-permission-warning-dialog';
import type { TransactionFormValues } from './form-schema';

type DbTransaction = Database['public']['Tables']['wallet_transactions']['Row'];
type DbTransactionCategory =
  Database['public']['Tables']['transaction_categories']['Row'];
type DbWallet = Database['private']['Tables']['workspace_wallets']['Row'];
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

export type TransactionFormInitialMode = 'transaction' | 'transfer';

export interface TransactionFormInitialTransaction {
  amount?: number;
  category_id?: string;
  categoryKind?: 'expense' | 'income';
  description?: string;
  origin_wallet_id?: string;
  taken_at?: Date;
}

export interface TransactionFormInitialTransfer {
  amount?: number;
  description?: string;
  destination_amount?: number;
  destination_wallet_id?: string;
  origin_wallet_id?: string;
  taken_at?: Date;
}

export interface TransactionFormProps {
  wsId: string;
  data?: Partial<Transaction>;
  onFinish?: (data: TransactionFormValues) => void;
  canCreateTransactions?: boolean;
  canUpdateTransactions?: boolean;
  canCreateConfidentialTransactions?: boolean;
  canUpdateConfidentialTransactions?: boolean;
  canChangeFinanceWallets?: boolean;
  canSetFinanceWalletsOnCreate?: boolean;
  initialMode?: TransactionFormInitialMode;
  initialTransaction?: TransactionFormInitialTransaction;
  initialTransfer?: TransactionFormInitialTransfer;
  permissionRequestUser?: FinancePermissionRequestUser | null;
}

export type NewContentType = 'wallet' | 'transaction-category' | 'tag';

export type NewContent = Wallet | TransactionCategory | TagDraft | undefined;
