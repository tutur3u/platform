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
  const t = await getTranslations();

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
      name: t('workspace-settings-layout.workspace'),
      href: `/${wsId}/settings`,
      matchExact: true,
    },
    {
      name: t('workspace-settings-layout.members'),
      href: `/${wsId}/members`,
    },
    {
      name: t('workspace-settings-layout.roles'),
      href: `/${wsId}/roles`,
      allowedRoles: ['OWNER'],
      requireRootMember: true,
    },
    {
      name: t('workspace-settings-layout.teams'),
      href: `/${wsId}/teams`,
      allowedRoles: ['ADMIN', 'OWNER'],
      requireRootWorkspace: true,
      disabled: true,
    },
    {
      name: t('workspace-settings-layout.reports'),
      href: `/${wsId}/settings/reports`,
      allowedRoles: ['ADMIN', 'OWNER'],
      disabled: !verifySecret('ENABLE_USERS', 'true', secrets),
    },
    {
      name: t('workspace-settings-layout.api_keys'),
      href: `/${wsId}/api-keys`,
      allowedRoles: ['ADMIN', 'OWNER'],
    },
    {
      name: t('workspace-settings-layout.secrets'),
      href: `/${wsId}/secrets`,
      requireRootMember: true,
    },
    {
      name: t('workspace-settings-layout.infrastructure'),
      href: `/${wsId}/infrastructure`,
      allowedRoles: ['ADMIN', 'OWNER'],
      requireRootWorkspace: true,
    },
    {
      name: t('workspace-settings-layout.migrations'),
      href: `/${wsId}/migrations`,
      allowedRoles: ['ADMIN', 'OWNER'],
      requireRootWorkspace: true,
    },
    {
      name: t('workspace-settings-layout.activities'),
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
