import type { Database } from './supabase';

type Workspace = Database['public']['Tables']['workspaces']['Row'];

export type InternalApiWorkspaceSummary = Pick<
  Workspace,
  'id' | 'name' | 'personal' | 'avatar_url' | 'logo_url'
> & {
  deleted?: Workspace['deleted'];
  access_type?: 'member' | 'guest';
  tier?: Database['public']['Enums']['workspace_product_tier'] | null;
  created_by_me?: boolean;
  guest_board_count?: number;
  guest_highest_permission?: 'view' | 'edit' | null;
  guest_landing_path?: string | null;
  guest_products?: Array<'tasks'>;
};
