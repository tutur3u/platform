'use client';

import type { ReactNode } from 'react';

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

export const useNavigation = (t: any): { categories: NavCategory[] } => {
  // const resources: NavItem[] = [
  //   {
  //     href: DEV_MODE
  //       ? 'http://localhost:7803/about'
  //       : 'https://tuturuuu.com/about',
  //     label: t('common.about'),
  //     description: t('common.about-description'),
  //     icon: <Info className="h-4 w-4" />,
  //   },
  //   {
  //     href: DEV_MODE
  //       ? 'http://localhost:7803/security'
  //       : 'https://tuturuuu.com/security',
  //     label: t('common.security'),
  //     description: t('common.security-description'),
  //     icon: <Shield className="h-4 w-4" />,
  //   },
  //   {
  //     href: DEV_MODE
  //       ? 'http://localhost:7803/terms'
  //       : 'https://tuturuuu.com/terms',
  //     label: t('common.terms'),
  //     description: t('common.terms-description'),
  //     icon: <Shield className="h-4 w-4" />,
  //   },
  //   {
  //     href: DEV_MODE
  //       ? 'http://localhost:7803/privacy'
  //       : 'https://tuturuuu.com/privacy',
  //     label: t('common.privacy'),
  //     description: t('common.privacy-description'),
  //     icon: <Shield className="h-4 w-4" />,
  //   },
  // ];

  const company: NavItem[] = [
    {
      href: '/',
      label: t('common.home'),
    },
    {
      href: '/about',
      label: t('common.about'),
    },
    {
      href: '/faq',
      label: t('common.faq'),
    },
    {
      href: '/guide',
      label: t('common.guide'),
    },
    {
      href: '/contact',
      label: t('common.contact'),
    },
  ];

  return {
    categories: [
      // { title: 'resources', items: resources },
      { title: 'company', items: company },
    ],
  };
};
