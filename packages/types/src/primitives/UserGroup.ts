import type { Entity } from './Entity';

export interface UserGroup extends Entity {
  id: string;
  ws_id?: string;
  is_guest: boolean;
  amount?: number;
  sessions?: string[];
  href?: string;
  description?: string;
}
