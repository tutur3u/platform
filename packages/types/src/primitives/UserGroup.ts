import type { Entity } from './Entity';

export interface UserGroup extends Entity {
  id: string;
  ws_id?: string;
  amount?: number;
  sessions?: string[];
  href?: string;
  description?: string;
}
