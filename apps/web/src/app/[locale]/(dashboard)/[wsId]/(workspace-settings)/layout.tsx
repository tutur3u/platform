import { NavLink, Navigation } from '@/components/navigation';
import { getCurrentUser } from '@/lib/user-helper';
import { getPermissions, getWorkspace } from '@/lib/workspace-helper';
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
  const { permissions } = await getPermissions({
    wsId,
    requiredPermissions: [
      'manage_workspace_members',
      'manage_workspace_roles',
      'manage_user_report_templates',
      'manage_workspace_security',
      'manage_workspace_secrets',
      'view_infrastructure',
      'manage_external_migrations',
      'manage_workspace_audit_logs',
    ],
  });

  const t = await getTranslations();

  const workspace = await getWorkspace(wsId);
  const user = await getCurrentUser();

  const navLinks: NavLink[] = [
    {
      name: t('workspace-settings-layout.workspace'),
      href: `/${wsId}/settings`,
      matchExact: true,
    },
    {
      name: t('workspace-settings-layout.members'),
      href: `/${wsId}/members`,
      disabled: !permissions.includes('manage_workspace_members'),
    },
    {
      name: t('workspace-settings-layout.roles'),
      href: `/${wsId}/roles`,
      disabled: !permissions.includes('manage_workspace_roles'),
    },
    {
      name: t('workspace-settings-layout.reports'),
      href: `/${wsId}/settings/reports`,
      disabled: !permissions.includes('manage_user_report_templates'),
    },
    {
      name: t('workspace-settings-layout.api_keys'),
      href: `/${wsId}/api-keys`,
      disabled: !permissions.includes('manage_workspace_security'),
    },
    {
      name: t('workspace-settings-layout.secrets'),
      href: `/${wsId}/secrets`,
      disabled: !permissions.includes('manage_workspace_secrets'),
      requireRootMember: true,
    },
    {
      name: t('workspace-settings-layout.infrastructure'),
      href: `/${wsId}/infrastructure`,
      disabled: !permissions.includes('view_infrastructure'),
      requireRootWorkspace: true,
    },
    {
      name: t('workspace-settings-layout.migrations'),
      href: `/${wsId}/migrations`,
      disabled: !permissions.includes('manage_external_migrations'),
      requireRootWorkspace: true,
    },
    {
      name: t('workspace-settings-layout.activities'),
      href: `/${wsId}/activities`,
      disabled: !permissions.includes('manage_workspace_audit_logs'),
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
