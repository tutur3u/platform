import { NavLink, Navigation } from '@/components/navigation';
import { getCurrentUser } from '@/lib/user-helper';
import { getWorkspace } from '@/lib/workspace-helper';
import useTranslation from 'next-translate/useTranslation';
import React from 'react';

interface LayoutProps {
  params: {
    wsId: string;
  };
  children: React.ReactNode;
}

export default async function Layout({
  children,
  params: { wsId },
}: LayoutProps) {
  const { t } = useTranslation('workspace-settings-layout');

  const workspace = await getWorkspace(wsId);
  const user = await getCurrentUser();

  const navLinks: NavLink[] = [
    {
      name: t('workspace'),
      href: `/${wsId}/settings`,
      matchExact: true,
    },
    {
      name: t('members'),
      href: `/${wsId}/members`,
    },
    {
      name: t('teams'),
      href: `/${wsId}/teams`,
      disabled: true,
    },
    {
      name: t('reports'),
      href: `/${wsId}/settings/reports`,
    },
    {
      name: t('api_keys'),
      href: `/${wsId}/api-keys`,
      allowedRoles: ['ADMIN', 'OWNER'],
    },
    {
      name: t('secrets'),
      href: `/${wsId}/secrets`,
      allowedRoles: ['ADMIN', 'OWNER'],
      requireRootMember: true,
    },
    {
      name: t('infrastructure'),
      href: `/${wsId}/infrastructure`,
      allowedRoles: ['ADMIN', 'OWNER'],
      requireRootWorkspace: true,
    },
    {
      name: t('migrations'),
      href: `/${wsId}/migrations`,
      allowedRoles: ['ADMIN', 'OWNER'],
      requireRootWorkspace: true,
    },
    {
      name: t('activities'),
      href: `/${wsId}/activities`,
      allowedRoles: ['ADMIN', 'OWNER'],
      requireRootWorkspace: true,
    },
  ];

  return (
    <div>
      <div className="scrollbar-none mb-4 flex gap-1 overflow-x-auto font-semibold">
        <Navigation
          currentWsId={wsId}
          currentRole={workspace?.role}
          currentUser={user}
          navLinks={navLinks}
        />
      </div>
      {children}
    </div>
  );
}
