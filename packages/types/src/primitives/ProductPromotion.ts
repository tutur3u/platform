import { Entity } from './Entity';

export interface ProductPromotion extends Entity {
  description?: string;
  code?: string;
  value: number | string;
  use_ratio: boolean;
  ws_id?: string;
}
