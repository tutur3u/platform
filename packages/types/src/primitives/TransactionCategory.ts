import type { Entity } from './Entity';

export interface TransactionCategory extends Entity {
  is_expense?: boolean;
  ws_id?: string;
}
