export interface Wallet {
  id?: string;
  name?: string;
  balance?: number;
  currency?: string;
  description?: string;
  statement_date?: number | null;
  payment_date?: number | null;
  report_opt_in?: boolean;
  limit?: number | null;
  type?: string;
  created_at?: Date;
  project_id?: string;
}
