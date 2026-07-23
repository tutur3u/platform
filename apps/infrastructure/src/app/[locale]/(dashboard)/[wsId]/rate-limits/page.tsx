import { Gauge } from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { RateLimitsClient } from './rate-limits-client';

export const metadata: Metadata = {
  description:
    'Manage per-subject rate limits — raise, lower, set absolute limits, or unlimit.',
  title: 'Rate Limits',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InfrastructureRateLimitsPage({ params }: Props) {
  await connection();

  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (!permissions || permissions.withoutPermission('view_infrastructure')) {
    redirect(`/${wsId}/settings`);
  }

  const t = await getTranslations('rate-limits');
  const canManage = !permissions.withoutPermission('manage_workspace_roles');

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
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md bg-secondary px-4 font-medium text-secondary-foreground text-sm transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/${wsId}/rate-limit-appeals`}
        >
          {t('actions.open_appeals')}
        </Link>
      </div>

      <Separator className="my-4" />

      <RateLimitsClient canManage={canManage} wsId={wsId} />
    </>
  );
}
