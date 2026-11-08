import { Flag } from '@tuturuuu/icons';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { FeatureFlagsTable } from './feature-flags-table';
import { buildFeatureFlagDashboardModel } from './read-model';

export const metadata: Metadata = {
  title: 'Feature Flags',
  description: 'Platform feature flag inventory and lifecycle.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

const SUMMARY_KEYS = [
  'total',
  'overdue',
  'scheduled',
  'awaitingVerification',
  'legacy',
] as const;

export default async function InfrastructureFeatureFlagsPage({
  params,
}: Props) {
  await connection();

  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);
  const access = await authorizeInfrastructureAdminRequest(
    'view_infrastructure'
  );
  if (!access.ok) notFound();

  const t = await getTranslations('feature-flags');
  const model = buildFeatureFlagDashboardModel(new Date());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Flag className="h-5 w-5 text-primary" />
        <h1 className="font-bold text-2xl">{t('title')}</h1>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {SUMMARY_KEYS.map((key) => (
          <div
            className="rounded-lg border border-border bg-foreground/5 p-3"
            key={key}
          >
            <dt className="text-muted-foreground text-xs">
              {t(`summary.${key}`)}
            </dt>
            <dd className="font-semibold text-2xl tabular-nums">
              {model.summary[key]}
            </dd>
          </div>
        ))}
      </dl>

      {model.groups.map((group) => (
        <FeatureFlagsTable group={group} key={group.family} t={t} />
      ))}
    </div>
  );
}
