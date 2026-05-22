import { RefreshCw } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAppCoordinationSessionPolicy } from '@/lib/app-coordination/session-policy';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { AppCoordinationClient } from './app-coordination-client';

export const metadata: Metadata = {
  title: 'App Coordination',
  description: 'Configure Tuturuuu-managed app-session token lifetimes.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InfrastructureAppCoordinationPage({
  params,
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

  const [t, initialPolicy] = await Promise.all([
    getTranslations('app-coordination-settings'),
    getAppCoordinationSessionPolicy({ bypassCache: true }),
  ]);

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

      <AppCoordinationClient initialPolicy={initialPolicy} />
    </>
  );
}
