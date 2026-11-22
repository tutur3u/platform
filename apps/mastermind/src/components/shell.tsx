import { Link, type LinkProps } from '@tanstack/react-router';
import {
  Activity,
  Bell,
  ChartLine,
  Folder,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Rocket,
  Server,
  ShieldCheck,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Structure } from '@tuturuuu/ui/custom/structure';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTheme } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { useHydrated } from '../fleet/preferences';
import {
  type Locale,
  localeParam,
  locales,
  type MessageKey,
  useI18n,
} from '../i18n';
import { toneBadge } from './tone';

export interface NavCounts {
  inbox: number;
  access: number;
}

type NavLabel = Extract<MessageKey, `nav.${string}`>;

/**
 * Who the shell is rendered for. An entry is shown when its `scopes` include
 * the viewer's scope; entries without `scopes` are owner-only. Pages a fleet
 * grantee can open (their admission is server-side) render the shell with
 * `scope="fleet"`; the command center itself is owner-only at admission, so
 * a grantee never renders it.
 */
export type NavScope = 'owner' | 'fleet';

/**
 * A sidebar entry: a section of the command center (`id` is its anchor), or,
 * with `to`, its own route under the locale. `scopes` defaults to owner only.
 */
export interface NavEntry {
  id: string;
  label: NavLabel;
  icon: typeof Inbox;
  to?: LinkProps['to'];
  scopes?: readonly NavScope[];
}

export const NAV: readonly NavEntry[] = [
  { id: 'overview', label: 'nav.overview', icon: LayoutDashboard },
  { id: 'inbox', label: 'nav.inbox', icon: Inbox },
  {
    id: 'projects',
    label: 'nav.projects',
    icon: Folder,
    to: '/{-$locale}/projects',
  },
  { id: 'access', label: 'nav.access', icon: KeyRound },
  { id: 'ship', label: 'nav.ship', icon: Rocket, to: '/{-$locale}/ship' },
  { id: 'fleet', label: 'nav.fleet', icon: Server },
  {
    id: 'fleet-access',
    label: 'nav.fleetAccess',
    icon: Users,
    to: '/{-$locale}/fleet-access',
    scopes: ['owner', 'fleet'],
  },
  { id: 'activity', label: 'nav.activity', icon: Activity },
  { id: 'approvals', label: 'nav.approvals', icon: ShieldCheck },
  { id: 'cost', label: 'nav.cost', icon: ChartLine },
  { id: 'settings', label: 'nav.settings', icon: Bell },
];

/** The entries `scope` may open. */
export function navFor(
  scope: NavScope,
  entries: readonly NavEntry[] = NAV
): NavEntry[] {
  return entries.filter((entry) => (entry.scopes ?? ['owner']).includes(scope));
}

const NAV_LINK =
  'flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-3 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-1 focus-visible:outline-ring/50';

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2 font-semibold">
      <span className="grid size-7 place-items-center rounded-md bg-primary font-bold text-primary-foreground text-xs">
        M
      </span>
      Mastermind
    </div>
  );
}

function Nav({
  counts,
  scope,
  onNavigate,
}: {
  counts?: NavCounts;
  scope: NavScope;
  onNavigate: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <nav aria-label="Mastermind" className="space-y-1 px-2">
      {navFor(scope).map(({ id, label, icon: Icon, to }) => {
        const count =
          id === 'inbox'
            ? counts?.inbox
            : id === 'access'
              ? counts?.access
              : undefined;
        const content = (
          <>
            <Icon className="size-4" />
            <span>{t(label)}</span>
            {count ? (
              <Badge
                variant="outline"
                className={toneBadge(
                  id === 'inbox' ? 'red' : 'orange',
                  'ml-auto'
                )}
              >
                {count}
              </Badge>
            ) : null}
          </>
        );
        // Sections link to the command center with their anchor, so they
        // also work from a routed page.
        return to ? (
          <Link
            key={id}
            to={to}
            params={{ locale: localeParam(locale) }}
            onClick={onNavigate}
            className={NAV_LINK}
            activeProps={{ className: 'bg-accent text-accent-foreground' }}
          >
            {content}
          </Link>
        ) : (
          <Link
            key={id}
            to="/{-$locale}"
            params={{ locale: localeParam(locale) }}
            hash={id}
            onClick={onNavigate}
            className={NAV_LINK}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

export function Preferences() {
  const { t, locale } = useI18n();
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={locale}>
        <TabsList aria-label={t('language')}>
          {locales.map((value: Locale) => (
            <TabsTrigger key={value} value={value} asChild>
              {/* Stays on the current route (and its search), so every
                  tier keeps the switch, not only owners. */}
              <Link
                to="."
                params={(prev) => ({ ...prev, locale: localeParam(value) })}
                search={(prev) => prev}
                hash
                resetScroll={false}
              >
                {value.toUpperCase()}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Tabs
        value={hydrated ? (theme ?? 'system') : 'system'}
        onValueChange={setTheme}
      >
        <TabsList aria-label={t('theme')}>
          {(['light', 'dark', 'system'] as const).map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(value)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

/** The page title card every Mastermind page starts with. */
export function PageHeader({
  title,
  subtitle,
  actions = <Preferences />,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-foreground/5 p-3 sm:p-4">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl">{title}</h1>
        {subtitle ? <p className="text-foreground/80">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}

export function Shell({
  counts,
  scope = 'owner',
  footer,
  children,
}: {
  counts?: NavCounts;
  scope?: NavScope;
  footer: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  // The desktop sidebar stays expanded; every Structure toggle (menu button,
  // close button, backdrop) flips only the mobile drawer.
  const label = mobileOpen ? t('sidebar.close') : t('sidebar.open');
  return (
    <div className="mastermind-shell">
      <Structure
        isCollapsed={false}
        setIsCollapsed={() => setMobileOpen((open) => !open)}
        mobileSidebarOpen={mobileOpen}
        sidebarLabels={{ open: label, close: label }}
        hideSizeToggle
        mobileHeader={<Brand />}
        sidebarHeader={<Brand />}
        sidebarContent={
          <Nav
            counts={counts}
            scope={scope}
            onNavigate={() => setMobileOpen(false)}
          />
        }
        actions={footer}
      >
        <div className="mx-auto max-w-6xl space-y-8 pb-8">{children}</div>
      </Structure>
    </div>
  );
}
