'use client';

import { ReactNode } from 'react';

export interface NavItem {
  href: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  external?: boolean;
  badge?: string;
}

export interface NavCategory {
  title: string;
  items: NavItem[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useNavigation = (t: any): { categories: NavCategory[] } => {
  const products: NavItem[] = [];

  const solutions: NavItem[] = [];

  const resources: NavItem[] = [];

  const company: NavItem[] = [];

  return {
    categories: [
      { title: 'main', items: [{ href: '/', label: t('common.home') }] },
      { title: 'products', items: products },
      { title: 'solutions', items: solutions },
      { title: 'resources', items: resources },
      { title: 'company', items: company },
    ],
  };
};
