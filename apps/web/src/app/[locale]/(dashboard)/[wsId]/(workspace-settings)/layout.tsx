import { NavLink, Navigation } from '@/components/navigation';
import { getCurrentUser } from '@/lib/user-helper';
import { getSecrets, getWorkspace, verifySecret } from '@/lib/workspace-helper';
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('workspace-settings-layout');

  const workspace = await getWorkspace(wsId);
  const user = await getCurrentUser();

  const secrets = await getSecrets({
    wsId,
    requiredSecrets: [
      'ENABLE_X',
      'ENABLE_AI',
      'ENABLE_CHAT',
      'ENABLE_CALENDAR',
      'ENABLE_USERS',
      'ENABLE_PROJECTS',
      'ENABLE_DOCS',
      'ENABLE_DRIVE',
      'ENABLE_INVENTORY',
      'ENABLE_HEALTHCARE',
    ],
    forceAdmin: true,
  });

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
      name: t('roles'),
      href: `/${wsId}/roles`,
      allowedRoles: ['OWNER'],
      requireRootWorkspace: true,
      requireRootMember: true,
    },
    {
      name: t('teams'),
      href: `/${wsId}/teams`,
      allowedRoles: ['ADMIN', 'OWNER'],
      requireRootWorkspace: true,
      disabled: true,
    },
    {
      name: t('reports'),
      href: `/${wsId}/settings/reports`,
      allowedRoles: ['ADMIN', 'OWNER'],
      disabled: !verifySecret('ENABLE_USERS', 'true', secrets),
    },
    {
      name: t('api_keys'),
      href: `/${wsId}/api-keys`,
      allowedRoles: ['ADMIN', 'OWNER'],
    },
    {
      name: t('secrets'),
      href: `/${wsId}/secrets`,
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
