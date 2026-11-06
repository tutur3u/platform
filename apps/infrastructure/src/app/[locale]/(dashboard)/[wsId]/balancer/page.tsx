import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { listBalancerRuns } from '@/lib/balancer/store';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { BalancerRunsTable } from './balancer-runs-table';

export const metadata: Metadata = {
  title: 'Balancer runs',
  description:
    'Requested runs placed across the fleet, with source and result identity.',
};

interface Props {
  params: Promise<{ wsId: string }>;
}

export default async function InfrastructureBalancerPage({ params }: Props) {
  await connection();
  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);
  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (!permissions) redirect(`/${wsId}/settings`);

  const [t, runs] = await Promise.all([
    getTranslations('balancer'),
    listBalancerRuns(),
  ]);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      <BalancerRunsTable
        runs={runs}
        labels={{
          run: t('columns.run'),
          state: t('columns.state'),
          host: t('columns.host'),
          source: t('columns.source'),
          lease: t('columns.lease'),
          result: t('columns.result'),
          requester: t('columns.requester'),
          updated: t('columns.updated'),
          empty: t('empty'),
          unknownHint: t('unknown_hint'),
          exitCode: t('exit_code'),
        }}
      />
    </div>
  );
}
