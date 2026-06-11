import type { Entity } from './Entity';

export interface Wallet extends Entity {
  audit_actual_balance?: number | null;
  audit_balance?: number;
  audit_checked_at?: string | null;
  audit_checkpoint_id?: string | null;
  audit_ledger_balance?: number;
  audit_post_checkpoint_delta?: number;
  audit_post_checkpoint_transaction_count?: number;
  audit_status?: 'clean' | 'no_checkpoint' | 'unresolved';
  audit_variance?: number;
  balance?: number;
  currency?: string;
  description?: string;
  statement_date?: number | null;
  payment_date?: number | null;
  report_opt_in?: boolean;
  limit?: number | null;
  type?: 'STANDARD' | 'CREDIT';
  href?: string;
  ws_id?: string;
  icon?: string | null;
  image_src?: string | null;
}
