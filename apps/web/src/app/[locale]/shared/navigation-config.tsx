'use client';

import { DEV_MODE, GITHUB_OWNER, GITHUB_REPO } from '@/constants/common';
import {
  BookText,
  Building,
  Calendar,
  Factory,
  FileText,
  Github,
  GraduationCap,
  HardHat,
  Hotel,
  Info,
  Paintbrush,
  Pill,
  Presentation,
  Shield,
  Sparkles,
  Store,
  Users,
  UsersRound,
  Utensils,
  WandSparkles,
} from '@tuturuuu/ui/icons';
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
  const products: NavItem[] = [
    {
      href: '/meet-together',
      label: t('common.meet-together'),
      description: t('common.meet-together-description'),
      icon: <UsersRound className="h-4 w-4" />,
    },
    {
      href: DEV_MODE
        ? 'http://localhost:7001'
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
      href: DEV_MODE ? 'http://localhost:7805' : 'https://nova.tuturuuu.com',
      label: 'Nova',
      description: t('common.nova-description'),
      icon: <WandSparkles className="h-4 w-4" />,
      badge: t('common.coming_soon'),
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
      href: '/visualizations/horse-racing',
      label: 'Horse Racing Algorithm',
      description: 'Visualize the horse racing ranking algorithm',
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      href: '/about',
      label: t('common.about'),
      description: t('common.about-description'),
      icon: <Info className="h-4 w-4" />,
    },
    {
      href: '/changelog',
      label: t('common.changelog'),
      description: t('common.changelog-description'),
      icon: <FileText className="h-4 w-4" />,
    },
    {
      href: '/careers',
      label: t('common.careers'),
      description: t('common.careers-description'),
      icon: <Users className="h-4 w-4" />,
    },
    {
      href: '/security',
      label: t('common.security'),
      description: t('common.security-description'),
      icon: <Shield className="h-4 w-4" />,
    },
    {
      href: '/pitch',
      label: t('common.pitch'),
      description: t('common.pitch-description'),
      icon: <Presentation className="h-4 w-4" />,
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
    {
      href: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
      label: 'GitHub',
      description: t('common.github-description'),
      icon: <Github className="h-4 w-4" />,
      external: true,
    },
  ];

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
