import {
  createFileRoute,
  notFound,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import { MonitoringSectionNav } from '@/components/infrastructure/monitoring/monitoring-section-nav';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

function redirectToWorkspaceSettings(locale: string, wsId: string): never {
  throw redirect({
    href: `/${locale}/${wsId}/settings`,
    statusCode: 307,
  });
}

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/monitoring'
)({
  component: InfrastructureMonitoringLayout,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Observe deployment health, runtime telemetry, request traffic, cron, logs, and container resources.',
      locale,
      title: 'Infrastructure Monitoring',
    });
  },
  loader: async ({ params }) => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/monitoring`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    if (workspace.workspaceId !== ROOT_WORKSPACE_ID) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    const canViewInfrastructure = await hasWorkspacePermission({
      data: {
        permission: 'view_infrastructure',
        wsId: ROOT_WORKSPACE_ID,
      },
    });
    if (!canViewInfrastructure) {
      throw notFound();
    }
  },
});

function InfrastructureMonitoringLayout() {
  const params = Route.useParams();
  const t = useTranslations('blue-green-monitoring');
  const baseHref = `/${params.locale}/${params.wsId}/infrastructure/monitoring`;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border/60 bg-background p-4">
        <div className="space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                {t('hero.kicker')}
              </p>
              <div>
                <h1 className="font-semibold text-2xl tracking-tight">
                  {t('title')}
                </h1>
                <p className="mt-2 text-muted-foreground text-sm">
                  {t('description')}
                </p>
              </div>
            </div>
          </div>

          <MonitoringSectionNav baseHref={baseHref} />
        </div>
      </section>

      <Outlet />
    </div>
  );
}
