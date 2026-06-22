'use client';

import {
  BookText,
  FileText,
  Fingerprint,
  HeartHandshake,
  History,
  Paintbrush,
  Shield,
  Users,
} from '@tuturuuu/icons/lucide-static';
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
  const main: NavItem[] = [
    { href: '/', label: t('common.home'), description: '' },
    {
      href: '/about',
      label: t('common.about'),
      description: '',
    },
    {
      href: '/contact',
      label: t('common.contact'),
      description: '',
    },
    {
      href: '/?hash-nav=1#pricing',
      label: t('common.pricing'),
      description: '',
    },
  ];

  const resources: NavItem[] = [
    {
      href: '/blog',
      label: t('common.blog'),
      description: t('common.blog-description'),
      icon: <BookText className="h-4 w-4" />,
    },
    {
      href: '/changelog',
      label: t('common.changelog'),
      description: t('common.changelog-description'),
      icon: <History className="h-4 w-4" />,
    },
    {
      href: '/careers',
      label: t('common.careers'),
      description: t('common.careers-description'),
      icon: <Users className="h-4 w-4" />,
    },
    {
      href: `/partners`,
      label: t('common.partners'),
      description: t('common.partners-description'),
      icon: <HeartHandshake className="h-4 w-4" />,
      external: true,
    },
    {
      href: '/contributors',
      label: t('common.contributors'),
      description: t('common.contributors-description'),
      icon: <Users className="h-4 w-4" />,
    },
    {
      href: '/security',
      label: t('common.security'),
      description: t('common.security-description'),
      icon: <Shield className="h-4 w-4" />,
    },
    {
      href: '/tools/random',
      label: t('common.random_generator'),
      description: t('common.random_generator-description'),
      icon: <Fingerprint className="h-4 w-4" />,
    },
    {
      href: '/branding',
      label: t('common.branding'),
      description: t('common.branding-description'),
      icon: <Paintbrush className="h-4 w-4" />,
    },
    {
      href: '/ui',
      label: t('common.ui'),
      description: t('common.ui-description'),
      icon: <Paintbrush className="h-4 w-4" />,
    },
    {
      href: 'https://docs.tuturuuu.com',
      label: t('common.documentation'),
      description: t('common.documentation-description'),
      icon: <FileText className="h-4 w-4" />,
      external: true,
    },
  ];

  return {
    categories: [
      { title: 'main', items: main },
      { title: 'resources', items: resources },
    ],
  };
};
