export interface WorkspaceRoleWalletWhitelist {
  id: string;
  role_id: string;
  wallet_id: string;
  viewing_window: string;
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
