import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { RefreshCw } from '@tuturuuu/icons';
import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api/client';
import { getAppCoordinationSessionPolicy } from '@tuturuuu/internal-api/infrastructure/apps';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import { AppCoordinationClient } from '@/components/infrastructure/app-coordination/app-coordination-client';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

type AppCoordinationRouteData = Awaited<
  ReturnType<typeof getAppCoordinationSessionPolicy>
>;

const loadAppCoordinationPolicy = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AppCoordinationRouteData> => {
    return getAppCoordinationSessionPolicy(
      withForwardedInternalApiAuth(getRequestHeaders())
    );
  }
);

function redirectToWorkspaceSettings(locale: string, wsId: string): never {
  throw redirect({
    href: `/${locale}/${wsId}/settings`,
    statusCode: 307,
  });
}

export const Route = createFileRoute(
  '/$locale/$wsId/infrastructure/app-coordination'
)({
  component: InfrastructureAppCoordinationRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Configure Tuturuuu-managed app-session token lifetimes.',
      locale,
      title: 'App Coordination',
    });
  },
  loader: async ({ params }): Promise<AppCoordinationRouteData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/app-coordination`,
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

    return loadAppCoordinationPolicy();
  },
});

function InfrastructureAppCoordinationRoute() {
  const data = Route.useLoaderData() as AppCoordinationRouteData;
  const t = useTranslations('app-coordination-settings');

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('title')}</h1>
          </div>
          <p className="text-foreground/80">{t('description')}</p>
        </div>
      </div>

      <Separator className="my-4" />

      <AppCoordinationClient initialPolicy={data} />
    </>
  );
}
