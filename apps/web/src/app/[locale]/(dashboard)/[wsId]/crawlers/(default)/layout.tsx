import { NavLink, Navigation } from '@/components/navigation';
import { getPermissions, getWorkspace } from '@/lib/workspace-helper';
import { BugPlay, Gauge, Globe, Link2 } from '@tuturuuu/ui/icons';
import { getCurrentUser } from '@tuturuuu/utils/server/user-helper';
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
  const t = await getTranslations('ws-crawlers');
  const { wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('ai_lab')) redirect(`/${wsId}`);

  const workspace = await getWorkspace(wsId);
  const user = await getCurrentUser();

  const navLinks: NavLink[] = [
    {
      title: t('crawled'),
      href: `/${wsId}/crawlers`,
      matchExact: true,
      icon: <Gauge className="h-4 w-4" />,
    },
    {
      title: t('uncrawled'),
      href: `/${wsId}/crawlers/uncrawled`,
      matchExact: true,
      icon: <BugPlay className="h-4 w-4" />,
    },
    {
      title: t('domains'),
      href: `/${wsId}/crawlers/domains`,
      matchExact: true,
      icon: <Globe className="h-4 w-4" />,
    },
    {
      title: t('connections'),
      href: `/${wsId}/crawlers/connections`,
      matchExact: true,
      icon: <Link2 className="h-4 w-4" />,
    },
  ];

  return (
    <div className="space-y-8">
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
