'use client';

import { Calendar, Sparkles, UsersRound, WandSparkles } from '@tuturuuu/icons';
import type { ReactNode } from 'react';
import { DEV_MODE } from '@/constants/common';

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
  const products: NavItem[] = [
    {
      href: '/meet-together',
      label: t('common.meet-together'),
      description: t('common.meet-together-description'),
      icon: <UsersRound className="h-4 w-4" />,
    },
    {
      href: DEV_MODE
        ? 'http://localhost:3001'
        : 'https://calendar.tuturuuu.com',
      label: t('common.calendar'),
      description: t('common.calendar-description'),
      icon: <Calendar className="h-4 w-4" />,
    },
    {
      href: DEV_MODE ? 'http://localhost:7804' : 'https://rewise.me',
      label: 'Rewise',
      description: t('common.rewise-description'),
      icon: <Sparkles className="h-4 w-4" />,
      badge: t('common.waitlist'),
      external: true,
    },
    {
      href: DEV_MODE ? 'http://localhost:7805' : 'https://nova.ai.vn',
      label: 'Nova',
      description: t('common.nova-description'),
      icon: <WandSparkles className="h-4 w-4" />,
      badge: t('common.coming_soon'),
      external: true,
    },
  ];

  const solutions: NavItem[] = [];

  const resources: NavItem[] = [];

  const company: NavItem[] = [
    {
      href: '/pricing',
      label: t('common.pricing'),
      description: '',
    },
    {
      href: '/contact',
      label: t('common.contact'),
      description: '',
    },
  ];

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
