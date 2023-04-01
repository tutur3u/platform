export type Mode =
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
};

export type NavTabs = {
  namespace: string;
  tabs: Tab[];
};
