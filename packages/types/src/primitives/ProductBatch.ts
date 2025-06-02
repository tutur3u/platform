import { Entity } from './Entity';

export interface ProductBatch extends Entity {
  price?: number;
  total_diff?: number;
  ws_id?: string | null;
  warehouse?: string;
  warehouse_id?: string;
  supplier?: string;
  supplier_id?: string;
}
