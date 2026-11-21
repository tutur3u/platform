'use client';

import {
  CalendarDays,
  House,
  LayoutGrid,
  ListTodo,
  Sparkles,
} from '@tuturuuu/icons';
import { AppsLauncherCoreDialog } from '@tuturuuu/satellite/apps-launcher-core';
import {
  MobileDock,
  type MobileDockItem,
} from '@tuturuuu/ui/custom/mobile-shell/mobile-dock';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { resolveDockLocation } from './dashboard-mobile-dock-location';

/**
 * The web dashboard's floating mobile dock: Home, Tasks, Calendar, Mira (the
 * personal workspace home) and Apps. Browser history owns Back on the web.
 * It shows on phones while Sorbet is on (sorbet-surfaces.css).
 */
export function DashboardMobileDock({ wsId }: { wsId: string }) {
  const t = useTranslations('common');
  const launcherT = useTranslations('command_launcher');
  const pathname = usePathname() ?? '';
  const params = useParams<{ wsId?: string }>();
  const [appsOpen, setAppsOpen] = useState(false);
  const location = resolveDockLocation(pathname, params?.wsId ?? wsId);
  if (!location) return null;

  const { base, destination } = location;
  const items: MobileDockItem[] = [
    {
      key: 'home',
      label: t('home'),
      icon: <House />,
      href: base,
      active: !appsOpen && destination === 'home',
    },
    {
      key: 'tasks',
      label: t('tasks'),
      icon: <ListTodo />,
      href: `${base}/tasks`,
      active: !appsOpen && destination === 'tasks',
    },
    {
      key: 'calendar',
      label: t('calendar'),
      icon: <CalendarDays />,
      href: `${base}/calendar`,
      active: !appsOpen && destination === 'calendar',
    },
    {
      key: 'mira',
      label: 'Mira',
      icon: <Sparkles />,
      href: location.miraHref,
    },
    {
      key: 'apps',
      label: t('apps'),
      icon: <LayoutGrid />,
      active: appsOpen,
      onSelect: () => setAppsOpen((open) => !open),
    },
  ];

  return (
    <>
      <MobileDock
        label={t('main_navigation')}
        items={items}
        renderLink={({ href, ...props }) => <Link href={href} {...props} />}
      />
      <AppsLauncherCoreDialog
        closeLabel={t('close')}
        linkComponent={Link}
        open={appsOpen}
        onOpenChange={setAppsOpen}
        t={(key, values) => launcherT(key as never, values as never)}
      />
    </>
  );
}
