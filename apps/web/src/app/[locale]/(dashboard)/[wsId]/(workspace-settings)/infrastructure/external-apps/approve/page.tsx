import { KeyRound } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { listExternalApps } from '@/lib/app-coordination/external-apps';
import { listEnabledManagedCronDomains } from '@/lib/managed-cron/domain-repository';
import { validateManagedCronEndpointUrl } from '@/lib/managed-cron/validation';
import { enforceInfrastructureRootWorkspace } from '../../enforce-infrastructure-root';
import {
  type ExternalAppApprovalSearchParams,
  parseExternalAppApprovalSearchParams,
  sanitizeExternalAppApprovalReturnUrl,
} from '../approval-utils';
import { ExternalAppApprovalClient } from '../external-app-approval-client';

export const metadata: Metadata = {
  title: 'Approve External App Scopes',
  description: 'Approve requested scopes for an external Tuturuuu app.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<ExternalAppApprovalSearchParams>;
}

export default async function ExternalAppApprovalPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (
    !permissions ||
    (permissions.withoutPermission('manage_workspace_secrets') &&
      permissions.withoutPermission('manage_workspace_roles'))
  ) {
    redirect(`/${wsId}/settings`);
  }

  const [t, apps, query] = await Promise.all([
    getTranslations('external-apps-settings'),
    listExternalApps(),
    searchParams,
  ]);
  const parsed = parseExternalAppApprovalSearchParams(query);
  const app = parsed.appId
    ? (apps.find((registration) => registration.id === parsed.appId) ?? null)
    : null;
  const returnUrl = app
    ? sanitizeExternalAppApprovalReturnUrl(
        parsed.returnUrl,
        app,
        getPlatformWebAppUrl(),
        parsed.origin ? [parsed.origin] : []
      )
    : null;
  const cronDomainApproved =
    parsed.feature === 'managed-cron' && parsed.origin
      ? await isManagedCronOriginApproved(parsed.origin)
      : true;

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-2xl">{t('approval.title')}</h1>
          </div>
          <p className="text-foreground/80">{t('approval.page_description')}</p>
        </div>
      </div>

      <Separator className="my-4" />

      <ExternalAppApprovalClient
        app={app}
        cronDomainApproved={cronDomainApproved}
        invalidScopes={parsed.invalidScopes}
        requestedOrigin={parsed.origin}
        requestedScopes={parsed.requestedScopes}
        requestedWorkspaceId={parsed.workspaceId}
        returnUrl={returnUrl}
      />
    </>
  );
}

async function isManagedCronOriginApproved(origin: string) {
  const endpointUrl = new URL(
    '/api/cron/scans/process-queue',
    origin
  ).toString();
  const validation = validateManagedCronEndpointUrl(
    endpointUrl,
    await listEnabledManagedCronDomains()
  );

  return validation.ok;
}

function getPlatformWebAppUrl() {
  return (
    process.env.WEB_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_WEB_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://tuturuuu.com'
  );
}
