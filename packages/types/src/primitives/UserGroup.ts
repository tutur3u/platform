import type { Entity } from './Entity';

export interface UserGroup extends Entity {
  id: string;
  ws_id?: string;
  name: string;
  is_guest: boolean;
  amount?: number;
  sessions?: string[];
  href?: string;
  description?: string;
  starting_date?: string | null;
  ending_date?: string | null;
  notes?: string | null;
}
