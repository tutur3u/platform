export type Mode =
  | 'settings'
  | 'workspace'
  | 'workspace_users'
  | 'team'
  | 'healthcare'
  | 'inventory'
  | 'finance'
  | 'infrastructure'
  | 'wallet_details'
  | 'product_details'
  | 'user_details'
  | 'user_group_details';

export type Tab = {
  name: string;
  href: string;
  disabled?: boolean;
};

export type NavTabs = {
  namespace: string;
  tabs: Tab[];
};
