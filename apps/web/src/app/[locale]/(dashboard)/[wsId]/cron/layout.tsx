import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type React from 'react';
import { Navigation, type NavLink } from '@/components/navigation';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const t = await getTranslations('workspace-ai-layout');
  const { wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('ai_lab')) redirect(`/${wsId}`);

  const workspace = await getWorkspace(wsId);
  const user = await getCurrentUser();

  const navLinks: NavLink[] = [
    {
      title: t('overview'),
      href: `/${wsId}/cron`,
      matchExact: true,
    },
    {
      title: t('cron_jobs'),
      href: `/${wsId}/cron/jobs`,
      matchExact: true,
    },
    {
      title: t('executions'),
      href: `/${wsId}/cron/executions`,
      matchExact: true,
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
