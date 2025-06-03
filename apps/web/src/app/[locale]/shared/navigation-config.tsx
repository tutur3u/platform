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
  const main: NavItem[] = [
    { href: '/', label: t('common.home') },
    { href: '/about', label: t('common.about') },
    { href: '/projects', label: t('common.projects') },
    { href: '/neo-crush', label: 'Neo Crush' },
    { href: '/neo-chess', label: 'Neo Chess' },
    { href: '/meet-together', label: t('common.meet-together') },
  ];

  const products: NavItem[] = [
    { href: '/', label: t('common.home') },
    { href: '/about', label: t('common.about') },
    { href: '/projects', label: t('common.projects') },
    { href: '/neo-crush', label: 'Neo Crush' },
    { href: '/neo-chess', label: 'Neo Chess' },
    { href: '/meet-together', label: t('common.meet-together') },
  ];

  const solutions: NavItem[] = [
    { href: '/', label: t('common.home') },
    { href: '/about', label: t('common.about') },
    { href: '/projects', label: t('common.projects') },
    { href: '/neo-crush', label: 'Neo Crush' },
    { href: '/neo-chess', label: 'Neo Chess' },
    { href: '/meet-together', label: t('common.meet-together') },
  ];

  const resources: NavItem[] = [
    { href: '/', label: t('common.home') },
    { href: '/about', label: t('common.about') },
    { href: '/projects', label: t('common.projects') },
    { href: '/neo-crush', label: 'Neo Crush' },
    { href: '/neo-chess', label: 'Neo Chess' },
    { href: '/meet-together', label: t('common.meet-together') },
  ];

  const company: NavItem[] = [
    { href: '/', label: t('common.home') },
    { href: '/about', label: t('common.about') },
    { href: '/projects', label: t('common.projects') },
    { href: '/neo-crush', label: 'Neo Crush' },
    { href: '/neo-chess', label: 'Neo Chess' },
    { href: '/meet-together', label: t('common.meet-together') },
  ];

  return {
    categories: [
      { title: 'main', items: main },
      { title: 'products', items: products },
      { title: 'solutions', items: solutions },
      { title: 'resources', items: resources },
      { title: 'company', items: company },
    ],
  };
};
