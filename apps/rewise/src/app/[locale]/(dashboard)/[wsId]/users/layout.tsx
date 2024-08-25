import { NavLink, Navigation } from '@/components/navigation';
import { getTranslations } from 'next-intl/server';
import React from 'react';

interface LayoutProps {
  params: {
    wsId?: string;
  };
  children: React.ReactNode;
}

export default async function Layout({
  children,
  params: { wsId },
}: LayoutProps) {
  const t = await getTranslations('workspace-users-tabs');

  const navLinks: NavLink[] = [
    {
      title: t('overview'),
      href: `/${wsId}/users`,
      matchExact: true,
    },
    {
      title: t('attendance'),
      href: `/${wsId}/users/attendance`,
    },
    {
      title: t('database'),
      href: `/${wsId}/users/database`,
    },
    {
      title: t('groups'),
      href: `/${wsId}/users/groups`,
    },
    {
      title: t('group_tags'),
      href: `/${wsId}/users/group-tags`,
    },
    {
      title: t('reports'),
      href: `/${wsId}/users/reports`,
    },
    {
      title: t('fields'),
      href: `/${wsId}/users/fields`,
    },
  ];

  return (
    <div>
      <Navigation navLinks={navLinks} />
      {children}
    </div>
  );
}
