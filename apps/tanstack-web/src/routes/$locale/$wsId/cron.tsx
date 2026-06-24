import {
  createFileRoute,
  notFound,
  Outlet,
  useLocation,
} from '@tanstack/react-router';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'use-intl';
import {
  getWorkspaceNextPath,
  requireCurrentUser,
} from '../../../lib/platform/auth-gate';
import { createPageHead } from '../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../lib/platform/messages';
import { Link } from '../../../lib/platform/next-link-shim';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../lib/platform/workspace-permission';

type CronNavItem = {
  href: string;
  title: string;
};

export const Route = createFileRoute('/$locale/$wsId/cron')({
  component: CronRouteLayout,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Cron in your Tuturuuu workspace.',
      locale,
      title: 'Cron',
    });
  },
  loader: async ({ location, params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy layout getCurrentUser() runs after
    // the permission gate, but auth must resolve to a real session regardless.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(params, location.pathname, 'cron'),
    });

    // Legacy layout getPermissions() -> notFound() when missing/forbidden.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy layout withoutPermission('ai_lab') -> redirect(`/${wsId}`).
    await requireWorkspacePermission({
      wsId: workspace.workspaceId,
      permission: 'ai_lab',
      locale: params.locale,
    });

    return workspace;
  },
});

function CronRouteLayout() {
  const params = Route.useParams();
  const pathname = useLocation({ select: (location) => location.pathname });
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;
  // `sidebar_tabs.cron` and `ws-cron.description` resolve via the $locale
  // layout's IntlProvider (verified present in both en.json and vi.json).
  const t = useTranslations();
  const baseHref = `/${params.locale}/${params.wsId}/cron`;

  if (!workspace) {
    throw notFound();
  }

  const navItems: CronNavItem[] = [
    {
      href: baseHref,
      title: t('workspace-ai-layout.overview'),
    },
    {
      href: `${baseHref}/jobs`,
      title: t('workspace-ai-layout.cron_jobs'),
    },
    {
      href: `${baseHref}/executions`,
      title: t('workspace-ai-layout.executions'),
    },
  ];

  const isOverviewPath = pathname === baseHref || pathname === `${baseHref}/`;

  return (
    <div>
      <CronNavigation items={navItems} pathname={pathname} />
      {isOverviewPath ? <CronOverview /> : <Outlet />}
    </div>
  );
}

function CronOverview() {
  const t = useTranslations();

  // Shell: the FeatureSummary header is a shared @tuturuuu/ui component that
  // needs no server data. The legacy page's two statistic cards
  // (JobsStatistics / ExecutionStatistics) render app-local
  // `@/components/cards/StatisticCard` and hard-require server-side Supabase
  // counts over `workspace_cron_jobs` / `workspace_cron_executions` with no
  // `@tuturuuu/internal-api` forwarded-auth reader yet — the same Phase-2
  // data-origin gap noted for the other migrated dashboard routes — so they
  // are intentionally omitted from this shell.
  return (
    <>
      <FeatureSummary
        pluralTitle={t('sidebar_tabs.cron')}
        singularTitle={t('sidebar_tabs.cron')}
        description={t('ws-cron.description')}
      />
      <Separator className="my-4" />
    </>
  );
}

function CronNavigation({
  items,
  pathname,
}: {
  items: CronNavItem[];
  pathname: string;
}) {
  return (
    <nav className="scrollbar-none mb-4 flex flex-none gap-1 overflow-x-auto font-semibold">
      {items.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            className={cn(
              'flex-none rounded-lg border px-3 py-1 text-sm transition md:text-base',
              isActive
                ? 'border-border bg-foreground/2.5 text-foreground dark:bg-foreground/5'
                : 'border-transparent text-foreground/70 md:hover:bg-foreground/5 md:hover:text-foreground dark:text-foreground/40'
            )}
            href={item.href}
            key={item.href}
          >
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
