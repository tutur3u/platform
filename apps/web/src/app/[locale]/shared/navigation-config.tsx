'use client';

import {
  BookText,
  Building,
  Calendar,
  CheckCircle2,
  Factory,
  FileText,
  GraduationCap,
  HardHat,
  HeartHandshake,
  History,
  Hotel,
  MessageSquare,
  Paintbrush,
  Pill,
  Shield,
  Store,
  Users,
  Utensils,
  Wallet,
} from '@tuturuuu/icons';
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
      href: '/women-in-tech',
      label: t('common.women-in-tech'),
      description: '',
    },
    {
      href: '/?hash-nav=1#pricing',
      label: t('common.pricing'),
      description: '',
    },
  ];

  const products: NavItem[] = [
    {
      href: DEV_MODE
        ? 'http://localhost:3001'
        : 'https://calendar.tuturuuu.com',
      label: t(`landing.features.apps.tuplan.title`),
      description: t(`landing.features.apps.tuplan.description`),
      badge: t('common.waitlist'),
      icon: <Calendar className="h-4 w-4" />,
    },
    {
      href: DEV_MODE ? 'http://localhost:7809' : 'https://tudo.com',
      label: t(`landing.features.apps.tudo.title`),
      description: t(`landing.features.apps.tudo.description`),
      badge: t('common.waitlist'),
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    {
      // href: '/meet-together',
      href: DEV_MODE ? 'http://localhost:7807' : 'https://tumeet.me',
      label: t(`landing.features.apps.tumeet.title`),
      description: t(`landing.features.apps.tumeet.description`),
      icon: <Users className="h-4 w-4" />,
    },
    {
      href: DEV_MODE ? 'http://localhost:7810' : 'https://tuchat.com',
      label: t(`landing.features.apps.tuchat.title`),
      description: t(`landing.features.apps.tuchat.description`),
      badge: t('common.coming_soon'),
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      href: DEV_MODE ? 'http://localhost:7808' : 'https://tufinance.com',
      label: t(`landing.features.apps.tufinance.title`),
      description: t(`landing.features.apps.tufinance.description`),
      badge: t('common.coming_soon'),
      icon: <Wallet className="h-4 w-4" />,
    },
    {
      href: DEV_MODE ? 'http://localhost:7805' : 'https://nova.ai.vn',
      label: t(`landing.features.apps.nova.title`),
      description: t(`landing.features.apps.nova.description`),
      icon: <GraduationCap className="h-4 w-4" />,
      external: true,
    },
  ];

  const solutions: NavItem[] = [
    {
      href: '/solutions/manufacturing',
      label: t('common.manufacturing'),
      description: t('common.manufacturing-description'),
      icon: <Factory className="h-4 w-4" />,
    },
    {
      href: '/solutions/restaurants',
      label: t('common.restaurants'),
      description: t('common.restaurants-description'),
      icon: <Utensils className="h-4 w-4" />,
    },
    {
      href: '/solutions/pharmacies',
      label: t('common.pharmacies'),
      description: t('common.pharmacies-description'),
      icon: <Pill className="h-4 w-4" />,
    },
    {
      href: '/solutions/realestate',
      label: t('common.realestate'),
      description: t('common.realestate-description'),
      icon: <Building className="h-4 w-4" />,
    },
    {
      href: '/solutions/retail',
      label: t('common.retail'),
      description: t('common.retail-description'),
      icon: <Store className="h-4 w-4" />,
    },
    {
      href: '/solutions/education',
      label: t('common.education'),
      description: t('common.education-description'),
      icon: <GraduationCap className="h-4 w-4" />,
    },
    {
      href: '/solutions/hospitality',
      label: t('common.hospitality'),
      description: t('common.hospitality-description'),
      icon: <Hotel className="h-4 w-4" />,
    },
    {
      href: '/solutions/construction',
      label: t('common.construction'),
      description: t('common.construction-description'),
      icon: <HardHat className="h-4 w-4" />,
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
      href: '/branding',
      label: t('common.branding'),
      description: t('common.branding-description'),
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
      { title: 'products', items: products },
      { title: 'solutions', items: solutions },
      { title: 'resources', items: resources },
    ],
  };
};
