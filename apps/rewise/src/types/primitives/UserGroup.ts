import { Entity } from './Entity';

export interface UserGroup extends Entity {
  id: string;
  ws_id?: string;
  amount?: number;
  href?: string;
}
