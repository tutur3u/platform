import { NavLink, Navigation } from '@/components/navigation';
import useTranslation from 'next-translate/useTranslation';
import React from 'react';

export const dynamic = 'force-dynamic';

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
  const { t } = useTranslation('workspace-users-tabs');

  const navLinks: NavLink[] = [
    {
      name: t('overview'),
      href: `/${wsId}/users`,
      matchExact: true,
    },
    {
      name: t('attendance'),
      href: `/${wsId}/users/attendance`,
    },
    {
      name: t('database'),
      href: `/${wsId}/users/database`,
    },
    {
      name: t('groups'),
      href: `/${wsId}/users/groups`,
    },
    {
      name: t('group_tags'),
      href: `/${wsId}/users/group-tags`,
    },
    {
      name: t('reports'),
      href: `/${wsId}/users/reports`,
    },
    {
      name: t('fields'),
      href: `/${wsId}/users/fields`,
    },
  ];

  return (
    <div>
      <div className="scrollbar-none mb-4 flex gap-1 overflow-x-auto font-semibold">
        <Navigation navLinks={navLinks} />
      </div>
      {children}
    </div>
  );
}
