import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { ExternalLink, Rocket } from '@tuturuuu/icons';
import { withForwardedInternalApiAuth } from '@tuturuuu/internal-api/client';
import {
  getMobileDeploymentState,
  type MobileDeploymentState,
} from '@tuturuuu/internal-api/infrastructure/mobile';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import { MobileDeploymentClient } from '@/components/infrastructure/mobile-deployment/mobile-deployment-client';
import { MOBILE_DEPLOYMENT_SETUP_GUIDE_URL } from '@/components/infrastructure/mobile-deployment/mobile-deployment-field-guidance';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { hasWorkspacePermission } from '@/lib/platform/workspace-permission';

const MOBILE_DEPLOYMENT_VAULT_PERMISSION =
  'manage_mobile_deployment_vault' as const;

const loadMobileDeploymentState = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MobileDeploymentState> => {
    return getMobileDeploymentState(
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
  '/$locale/$wsId/infrastructure/mobile-deployment'
)({
  component: InfrastructureMobileDeploymentRoute,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage production mobile deployment vault resources.',
      locale,
      title: 'Mobile Deployment',
    });
  },
  loader: async ({ params }): Promise<MobileDeploymentState> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/infrastructure/mobile-deployment`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists || workspace.workspaceId !== ROOT_WORKSPACE_ID) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    const canManageMobileDeploymentVault = await hasWorkspacePermission({
      data: {
        permission: MOBILE_DEPLOYMENT_VAULT_PERMISSION,
        wsId: ROOT_WORKSPACE_ID,
      },
    });
    if (!canManageMobileDeploymentVault) {
      redirectToWorkspaceSettings(params.locale, params.wsId);
    }

    return loadMobileDeploymentState();
  },
});

function InfrastructureMobileDeploymentRoute() {
  const state = Route.useLoaderData() as MobileDeploymentState;
  const t = useTranslations('mobile-deployment-settings');

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('title')}</h1>
          </div>
          <p className="text-foreground/80">{t('description')}</p>
          <a
            className="inline-flex items-center gap-1.5 text-primary text-sm hover:underline"
            href={MOBILE_DEPLOYMENT_SETUP_GUIDE_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-4 w-4" />
            {t('guidance.setupGuide')}
          </a>
        </div>
      </div>

      <Separator className="my-4" />

      <MobileDeploymentClient initialData={state} />
    </>
  );
}
