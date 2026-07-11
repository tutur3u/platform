import { KeyRound } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { listExternalApps } from '@/lib/app-coordination/external-apps';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { ExternalAppsClient } from './external-apps-client';

export const metadata: Metadata = {
  title: 'External Apps',
  description: 'Issue and rotate secrets for external Tuturuuu apps.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InfrastructureExternalAppsPage({
  params,
}: Props) {
  await connection();

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

  const [t, apps] = await Promise.all([
    getTranslations('external-apps-settings'),
    listExternalApps(),
  ]);

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

      <ExternalAppsClient initialApps={apps} />
    </>
  );
}
