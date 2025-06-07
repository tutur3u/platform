import { ReactNode } from 'react';

export interface NavLink {
  title: string;
  label?: string;
  href?: string;
  disabled?: boolean;
  external?: boolean;
  icon?: ReactNode;
  isBack?: boolean;
  onClick?: () => void;
  children?: NavLink[];
  aliases?: string[];
  requireRootMember?: boolean;
  requireRootWorkspace?: boolean;
  disableOnProduction?: boolean;
  allowedRoles?: string[];
  matchExact?: boolean;
  experimental?: 'alpha' | 'beta' | 'new';
  shortcut?: string;
}
