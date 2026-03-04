import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet as WalletType } from '@tuturuuu/types/primitives/Wallet';
import type { TransactionFormValues } from './form-schema';

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

export type NewContent =
  | WalletType
  | TransactionCategory
  | { name: string; color?: string }
  | undefined;
