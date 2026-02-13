import { BugPlay, Gauge, Globe, Link2 } from '@tuturuuu/icons';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
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
  const t = await getTranslations('ws-crawlers');
  const { wsId } = await params;

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;

  if (withoutPermission('ai_lab')) redirect(`/${wsId}`);

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
      <Navigation currentWsId={wsId} currentUser={user} navLinks={navLinks} />
      {children}
    </div>
  );
}
