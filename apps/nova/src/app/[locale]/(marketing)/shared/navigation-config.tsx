'use client';

import { BookOpen, Info, Shield } from '@tuturuuu/icons';
import type { ReactNode } from 'react';
import { DEV_MODE, TTR_URL } from '@/constants/common';

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
  const resources: NavItem[] = [
    {
      href: `${TTR_URL}/about`,
      label: t('common.about'),
      description: t('common.about-description'),
      icon: <Info className="h-4 w-4" />,
    },
    {
      href: `${TTR_URL}/security`,
      label: t('common.security'),
      description: t('common.security-description'),
      icon: <Shield className="h-4 w-4" />,
    },
    {
      href: `${TTR_URL}/terms`,
      label: t('common.terms'),
      description: t('common.terms-description'),
      icon: <Shield className="h-4 w-4" />,
    },
    {
      href: `${TTR_URL}/privacy`,
      label: t('common.privacy'),
      description: t('common.privacy-description'),
      icon: <Shield className="h-4 w-4" />,
    },
  ];

  const company: NavItem[] = [
    {
      href: DEV_MODE
        ? 'http://localhost:3000/prompt-engineering/introduction'
        : 'https://docs.tuturuuu.com/prompt-engineering/introduction',
      label: t('common.learn'),
      description: t('common.learn-description'),
      icon: <BookOpen className="h-4 w-4" />,
    },
    {
      href: `${TTR_URL}/contact`,
      label: t('common.contact'),
      description: '',
    },
  ];

  return {
    categories: [
      {
        title: 'main',
        items: [
          {
            href: '/competitions/neo-league/prompt-the-future/about',
            label: 'Neo League',
          },
        ],
      },
      { title: 'resources', items: resources },
      { title: 'company', items: company },
    ],
  };
};
