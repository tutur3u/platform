import { Entity } from './Entity';

export interface Wallet extends Entity {
  balance?: number;
  currency?: string;
  description?: string;
  statement_date?: number | null;
  payment_date?: number | null;
  report_opt_in?: boolean;
  limit?: number | null;
  type?: string;
  ws_id?: string;
}
