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
      title: t('workspace-settings-layout.workspace'),
      href: `/${wsId}/settings`,
      matchExact: true,
    },
    {
      title: t('workspace-settings-layout.members'),
      href: `/${wsId}/members`,
      disabled: !permissions.includes('manage_workspace_members'),
    },
    {
      title: t('workspace-settings-layout.roles'),
      href: `/${wsId}/roles`,
      disabled: !permissions.includes('manage_workspace_roles'),
    },
    {
      title: t('workspace-settings-layout.reports'),
      href: `/${wsId}/settings/reports`,
      disabled: !permissions.includes('manage_user_report_templates'),
    },
    {
      title: t('workspace-settings-layout.api_keys'),
      href: `/${wsId}/api-keys`,
      disabled: !permissions.includes('manage_workspace_security'),
    },
    {
      title: t('workspace-settings-layout.secrets'),
      href: `/${wsId}/secrets`,
      disabled: !permissions.includes('manage_workspace_secrets'),
      requireRootMember: true,
    },
    {
      title: t('workspace-settings-layout.infrastructure'),
      href: `/${wsId}/infrastructure`,
      disabled: !permissions.includes('view_infrastructure'),
      requireRootWorkspace: true,
    },
    {
      title: t('workspace-settings-layout.migrations'),
      href: `/${wsId}/migrations`,
      disabled: !permissions.includes('manage_external_migrations'),
      requireRootWorkspace: true,
    },
    {
      title: t('workspace-settings-layout.activities'),
      href: `/${wsId}/activities`,
      disabled: !permissions.includes('manage_workspace_audit_logs'),
      requireRootWorkspace: true,
    },
  ];

  return (
    <div>
      <Navigation
        currentWsId={wsId}
        currentRole={workspace?.role}
        currentUser={user}
        navLinks={navLinks}
      />
      {children}
    </div>
  );
}
