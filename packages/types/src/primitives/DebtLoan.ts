export type DebtLoanType = 'debt' | 'loan';
export type DebtLoanStatus = 'active' | 'paid' | 'defaulted' | 'cancelled';
export type InterestCalculationType = 'simple' | 'compound';

export interface DebtLoan {
  id: string;
  ws_id: string;
  name: string;
  description?: string | null;
  counterparty?: string | null;
  type: DebtLoanType;
  principal_amount: number;
  currency: string;
  interest_rate?: number | null;
  interest_type?: InterestCalculationType | null;
  start_date: string;
  due_date?: string | null;
  status: DebtLoanStatus;
  wallet_id?: string | null;
  creator_id: string;
  created_at: string;
  updated_at: string;
  total_paid: number;
  total_interest_paid: number;
}

export interface DebtLoanWithBalance extends DebtLoan {
  remaining_balance: number;
  progress_percentage: number;
}

export interface DebtLoanTransaction {
  id: string;
  debt_loan_id: string;
  transaction_id: string;
  amount: number;
  is_interest: boolean;
  note?: string | null;
  created_at: string;
}

export interface DebtLoanSummary {
  total_debts: number;
  total_loans: number;
  active_debt_count: number;
  active_loan_count: number;
  total_debt_remaining: number;
  total_loan_remaining: number;
  net_position: number;
}

/**
 * Configuration for debt/loan category mappings stored in workspace_configs
 */
export interface DebtLoanCategoryConfig {
  debt_category_id?: string | null;
  loan_category_id?: string | null;
  repayment_category_id?: string | null;
  debt_collection_category_id?: string | null;
}

/**
 * Form data for creating/updating a debt/loan entry
 */
export interface DebtLoanFormData {
  name: string;
  description?: string;
  counterparty?: string;
  type: DebtLoanType;
  principal_amount: number;
  currency: string;
  interest_rate?: number;
  interest_type?: InterestCalculationType;
  start_date: string;
  due_date?: string;
  wallet_id?: string;
}

/**
 * Form data for linking a transaction to a debt/loan
 */
export interface DebtLoanTransactionFormData {
  transaction_id: string;
  amount: number;
  is_interest: boolean;
  note?: string;
}
