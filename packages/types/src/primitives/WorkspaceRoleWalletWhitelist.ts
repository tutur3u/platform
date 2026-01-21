export type ViewingWindow =
  | '1_day'
  | '3_days'
  | '7_days'
  | '2_weeks'
  | '1_month'
  | '1_quarter'
  | '1_year'
  | 'custom';

export interface WorkspaceRoleWalletWhitelist {
  id: string;
  role_id: string;
  wallet_id: string;
  viewing_window: ViewingWindow;
  custom_days?: number | null;
  created_at: string;
  workspace_roles?: {
    id: string;
    name: string;
  } | null;
  workspace_wallets?: {
    id: string;
    name: string;
    balance?: number;
    currency?: string;
    type?: string;
  } | null;
}
