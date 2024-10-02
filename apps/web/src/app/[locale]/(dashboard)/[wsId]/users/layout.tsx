import { NavLink, Navigation } from '@/components/navigation';
import { getPermissions } from '@/lib/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const t = await getTranslations('workspace-users-tabs');
  const { wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_users')) redirect(`/${wsId}`);

  const navLinks: NavLink[] = [
    {
      title: t('overview'),
      href: `/${wsId}/users`,
      matchExact: true,
      disabled: withoutPermission('manage_users'),
    },
    {
      title: t('attendance'),
      href: `/${wsId}/users/attendance`,
      disabled: withoutPermission('manage_users'),
    },
    {
      title: t('database'),
      href: `/${wsId}/users/database`,
      disabled: withoutPermission('manage_users'),
    },
    {
      title: t('groups'),
      href: `/${wsId}/users/groups`,
      disabled: withoutPermission('manage_users'),
    },
    {
      title: t('group_tags'),
      href: `/${wsId}/users/group-tags`,
      disabled: withoutPermission('manage_users'),
    },
    {
      title: t('reports'),
      href: `/${wsId}/users/reports`,
      disabled: withoutPermission('manage_users'),
    },
    {
      title: t('fields'),
      href: `/${wsId}/users/fields`,
      disabled: withoutPermission('manage_users'),
    },
  ];

  return (
    <div>
      <Navigation navLinks={navLinks} />
      {children}
    </div>
  );
}
