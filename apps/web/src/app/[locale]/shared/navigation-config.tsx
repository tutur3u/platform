'use client';

import { BookText } from '@ncthub/ui/icons';
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

export const useNavigation = (t: any): { categories: NavCategory[] } => {
  const resources = [
    {
      href: '/about',
      label: t('common.about'),
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      icon: <BookText />,
    },
    {
      href: '/contributors',
      label: t('common.contributors'),
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      icon: <BookText />,
    },
    {
      href: '/projects',
      label: t('common.projects'),
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      icon: <BookText />,
    },
  ] as NavItem[];

  const products = [
    {
      href: '/meet-together',
      label: t('common.meet-together'),
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      icon: <BookText />,
    },
    {
      href: '/neo-generator',
      label: 'Neo Generator',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      icon: <BookText />,
    },
    {
      href: '/scanner',
      label: 'Scanner',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      icon: <BookText />,
    },
  ] as NavItem[];

  const games = [
    {
      href: '/neo-crush',
      label: 'Neo Crush',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      icon: <BookText />,
    },
    {
      href: '/neo-chess',
      label: 'Neo Chess',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      icon: <BookText />,
    },
  ] as NavItem[];

  return {
    categories: [
      { title: 'main', items: [{ href: '/', label: t('common.home') }] },
      { title: 'resources', items: resources },
      { title: 'products', items: products },
      { title: 'games', items: games },
    ],
  };
};
