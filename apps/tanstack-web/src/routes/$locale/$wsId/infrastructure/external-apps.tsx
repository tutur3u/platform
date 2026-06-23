import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { KeyRound } from '@tuturuuu/icons';
import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api/client';
import { listExternalApps } from '@tuturuuu/internal-api/infrastructure/apps';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import { ExternalAppsClient } from '@/components/infrastructure/external-apps/external-apps-client';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type ExternalAppsRouteData = Awaited<ReturnType<typeof listExternalApps>>;

const loadExternalApps = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ExternalAppsRouteData> => {
    return listExternalApps(withForwardedInternalApiAuth(getRequestHeaders()));
  }
);

function redirectToWorkspaceSettings(locale: string, wsId: string): never {
  throw redirect({
    href: `/${locale}/${wsId}/settings`,
    statusCode: 307,
  });
}

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/external-apps'
)({
  component: InfrastructureExternalAppsRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Issue and rotate secrets for external Tuturuuu apps.',
      locale,
      title: 'External Apps',
    });
  },
  loader: async ({ params }): Promise<ExternalAppsRouteData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/external-apps`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists || workspace.workspaceId !== ROOT_WORKSPACE_ID) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    const [canManageSecrets, canManageRoles] = await Promise.all([
      hasWorkspacePermission({
        data: {
          permission: 'manage_workspace_secrets',
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

    if (!(canManageSecrets || canManageRoles)) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    return loadExternalApps();
  },
});

function InfrastructureExternalAppsRoute() {
  const data = Route.useLoaderData() as ExternalAppsRouteData;
  const t = useTranslations('external-apps-settings');

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('title')}</h1>
          </div>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
      </div>

      <Separator className="my-4" />

      <ExternalAppsClient initialApps={data.apps} />
    </>
  );
}
