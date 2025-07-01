import type { Entity } from './Entity';

export interface Wallet extends Entity {
  balance?: number;
  currency?: 'VND';
  description?: string;
  statement_date?: number | null;
  payment_date?: number | null;
  report_opt_in?: boolean;
  limit?: number | null;
  type?: 'STANDARD' | 'CREDIT';
  href?: string;
  ws_id?: string;
}
