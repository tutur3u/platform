import { Link, type LinkProps } from '@tanstack/react-router';
import {
  Activity,
  Bell,
  ChartLine,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Server,
  ShieldCheck,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Structure } from '@tuturuuu/ui/custom/structure';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTheme } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { useHydrated } from '../fleet/preferences';
import { type Locale, locales, type MessageKey, useI18n } from '../i18n';
import { toneBadge } from './tone';

export interface NavCounts {
  inbox: number;
  access: number;
}

type NavLabel = Extract<MessageKey, `nav.${string}`>;

/**
 * A sidebar entry: a section of the command center (`id` is its anchor), or,
 * with `to`, its own route under the locale.
 */
interface NavEntry {
  id: string;
  label: NavLabel;
  icon: typeof Inbox;
  to?: LinkProps['to'];
}

const NAV: readonly NavEntry[] = [
  { id: 'overview', label: 'nav.overview', icon: LayoutDashboard },
  { id: 'inbox', label: 'nav.inbox', icon: Inbox },
  { id: 'access', label: 'nav.access', icon: KeyRound },
  { id: 'fleet', label: 'nav.fleet', icon: Server },
  { id: 'activity', label: 'nav.activity', icon: Activity },
  { id: 'approvals', label: 'nav.approvals', icon: ShieldCheck },
  { id: 'cost', label: 'nav.cost', icon: ChartLine },
  { id: 'settings', label: 'nav.settings', icon: Bell },
];

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
  onNavigate,
}: {
  counts?: NavCounts;
  onNavigate: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <nav aria-label="Mastermind" className="space-y-1 px-2">
      {NAV.map(({ id, label, icon: Icon, to }) => {
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
            params={{ locale }}
            onClick={onNavigate}
            className={NAV_LINK}
            activeProps={{ className: 'bg-accent text-accent-foreground' }}
          >
            {content}
          </Link>
        ) : (
          <Link
            key={id}
            to="/$locale"
            params={{ locale }}
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
              <Link to="/$locale" params={{ locale: value }} hash={undefined}>
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

export function Shell({
  counts,
  footer,
  children,
}: {
  counts?: NavCounts;
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
          <Nav counts={counts} onNavigate={() => setMobileOpen(false)} />
        }
        actions={footer}
      >
        <div className="mx-auto max-w-6xl space-y-8 pb-8">{children}</div>
      </Structure>
    </div>
  );
}
