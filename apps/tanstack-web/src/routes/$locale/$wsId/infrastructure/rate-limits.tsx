import { createFileRoute, redirect } from '@tanstack/react-router';
import { Gauge } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import { RateLimitsClient } from '@/components/infrastructure/rate-limits/rate-limits-client';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type RateLimitsRouteData = {
  canManage: boolean;
};

function redirectToWorkspaceSettings(locale: string, wsId: string): never {
  throw redirect({
    href: `/${locale}/${wsId}/settings`,
    statusCode: 307,
  });
}

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/rate-limits'
)({
  component: RateLimitsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage per-subject rate limits - raise, lower, set absolute limits, or unlimit.',
      locale,
      title: 'Rate Limits',
    });
  },
  loader: async ({ params }): Promise<RateLimitsRouteData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/rate-limits`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists || workspace.workspaceId !== ROOT_WORKSPACE_ID) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    const [canView, canManage] = await Promise.all([
      hasWorkspacePermission({
        data: {
          permission: 'view_infrastructure',
          wsId: ROOT_WORKSPACE_ID,
        },
      }),
      hasWorkspacePermission({
        data: {
          permission: 'manage_workspace_roles',
          wsId: ROOT_WORKSPACE_ID,
        },
      }),
    ]);

    if (!canView) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    return { canManage };
  },
});

function RateLimitsRoutePage() {
  const { canManage } = Route.useLoaderData() as RateLimitsRouteData;
  const t = useTranslations('rate-limits');

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('title')}</h1>
          </div>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
      </div>

      <Separator className="my-4" />

      <RateLimitsClient canManage={canManage} />
    </>
  );
}
