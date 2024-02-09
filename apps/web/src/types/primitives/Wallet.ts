import { Entity } from './Entity';

export interface Wallet extends Entity {
  balance?: number;
  currency?: 'VND';
  description?: string;
  statement_date?: number | null;
  payment_date?: number | null;
  report_opt_in?: boolean;
  limit?: number | null;
  type?: 'STANDARD' | 'CREDIT';
  ws_id?: string;
}
