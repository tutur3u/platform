export type Mode =
  | 'settings'
  | 'workspace'
  | 'workspace_users'
  | 'team'
  | 'healthcare'
  | 'inventory'
  | 'finance'
  | 'product_details'
  | 'user_details';

export type Tab = {
  name: string;
  href: string;
  disabled?: boolean;
};

export type NavTabs = {
  namespace: string;
  tabs: Tab[];
};
