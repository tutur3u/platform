'use client';

import {
  CalendarDays,
  House,
  LayoutGrid,
  ListTodo,
  Sparkles,
} from '@tuturuuu/icons';
import {
  MobileDock,
  type MobileDockItem,
} from '@tuturuuu/ui/custom/mobile-shell/mobile-dock';
import {
  getLaunchableApp,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { AppsLauncherDialog } from './apps-launcher';
import {
  resolveSatelliteDockLocation,
  type SatelliteDockLocation,
  type SatelliteDockSlot,
} from './satellite-mobile-dock-location';

const subscribeToNothing = () => () => {};
const readOrigin = () => window.location.origin;
const readNoOrigin = () => null;

/** Destination app and the page under the workspace for each slot. */
const DESTINATIONS = {
  home: { app: 'platform', section: '' },
  tasks: { app: 'tasks', section: '/tasks' },
  calendar: { app: 'calendar', section: '' },
} as const;

/** Mira on the web is the personal workspace home on the platform app. */
const MIRA_PATH = '/personal';

/**
 * The product-wide mobile dock in every satellite: Home, Tasks, Calendar,
 * Mira (the platform's personal workspace home) and Apps. Tasks and Calendar
 * mark their own slot; other apps keep Apps active. Links into this app stay
 * in-app; links to other apps resolve their origin for the current environment.
 * Browser history owns Back on the web. It shows on phones while Sorbet is on
 * (sorbet-surfaces.css).
 */
export function SatelliteMobileDock({ currentApp }: { currentApp: string }) {
  const pathname = usePathname() ?? '';
  const params = useParams<{ wsId?: string }>();
  const origin = useSyncExternalStore(
    subscribeToNothing,
    readOrigin,
    readNoOrigin
  );
  const location = resolveSatelliteDockLocation(
    pathname,
    params?.wsId,
    currentApp
  );
  // Nothing renders (or reads messages) outside a workspace route.
  if (!origin || !location) return null;
  return (
    <SatelliteMobileDockView
      currentApp={currentApp}
      location={location}
      origin={origin}
    />
  );
}

function SatelliteMobileDockView({
  currentApp,
  location,
  origin,
}: {
  currentApp: string;
  location: SatelliteDockLocation;
  origin: string;
}) {
  const t = useTranslations('mobile_dock');
  const [appsOpen, setAppsOpen] = useState(false);

  const hrefFor = (slot: Exclude<SatelliteDockSlot, 'apps'>) => {
    if (slot === 'mira') {
      const platform = getLaunchableApp('platform');
      return platform
        ? resolveLaunchableAppUrl({
            app: platform,
            currentOrigin: origin,
            path: MIRA_PATH,
          })
        : undefined;
    }
    const { app: slug, section } = DESTINATIONS[slot];
    // In-app links keep this URL's locale; the app adds its own base path.
    if (slug === currentApp) return `${location.base}${section}`;
    const app = getLaunchableApp(slug);
    // Unprefixed path: the helper adds any active mount prefix.
    return app
      ? resolveLaunchableAppUrl({
          app,
          currentOrigin: origin,
          path: `/${location.workspace}${section}`,
        })
      : undefined;
  };

  const slot = (
    key: Exclude<SatelliteDockSlot, 'apps'>,
    label: string,
    icon: MobileDockItem['icon']
  ): MobileDockItem => ({
    key,
    label,
    icon,
    href: hrefFor(key),
    active: !appsOpen && location.active === key,
  });

  const items: MobileDockItem[] = [
    slot('home', t('home'), <House />),
    slot('tasks', t('tasks'), <ListTodo />),
    slot('calendar', t('calendar'), <CalendarDays />),
    slot('mira', 'Mira', <Sparkles />),
    {
      key: 'apps',
      label: t('apps'),
      icon: <LayoutGrid />,
      active: appsOpen || location.active === 'apps',
      onSelect: () => setAppsOpen((open) => !open),
    },
  ];

  return (
    <>
      <MobileDock
        label={t('navigation')}
        items={items}
        renderLink={({ href, ...props }) =>
          href.startsWith('/') ? (
            <Link href={href} {...props} />
          ) : (
            <a href={href} {...props} />
          )
        }
      />
      <AppsLauncherDialog open={appsOpen} onOpenChange={setAppsOpen} />
    </>
  );
}
