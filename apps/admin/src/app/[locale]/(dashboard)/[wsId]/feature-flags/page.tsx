import { featureFlagCatalog } from '@tuturuuu/feature-flags';
import { Flag } from '@tuturuuu/icons';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import { FeatureFlagAudit } from './feature-flag-audit';
import { FeatureFlagsTable } from './feature-flags-table';
import { FeatureFlagToggle } from './feature-flag-toggle';
import { buildFeatureFlagDashboardModel } from './read-model';
import {
  loadFeatureFlagAudit,
  loadFeatureFlagDashboardSnapshot,
} from './snapshot';

export const metadata: Metadata = {
  title: 'Feature Flags',
  description: 'Platform feature flag inventory and lifecycle.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams?: Promise<{
    q?: string | string[];
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
  searchParams,
}: Props) {
  await connection();

  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);
  const access = await authorizeInfrastructureAdminRequest(
    'view_infrastructure'
  );
  if (!access.ok) notFound();

  const [storage, audit] = await Promise.all([
    loadFeatureFlagDashboardSnapshot(access.user.id),
    loadFeatureFlagAudit(access.user.id),
  ]);
  const mutate = await authorizeInfrastructureAdminRequest(
    'manage_workspace_roles'
  );
  const t = await getTranslations('feature-flags');
  const model = buildFeatureFlagDashboardModel(
    new Date(),
    featureFlagCatalog,
    storage
  );
  const queryValue = searchParams ? (await searchParams).q : undefined;
  const query = (
    Array.isArray(queryValue) ? (queryValue[0] ?? '') : (queryValue ?? '')
  )
    .trim()
    .toLowerCase();
  const groups = query
    ? model.groups
        .map((group) => ({
          ...group,
          rows: group.rows.filter((row) =>
            row.key.toLowerCase().includes(query)
          ),
        }))
        .filter((group) => group.rows.length > 0)
    : model.groups;
  const canMutate = mutate.ok && storage.status === 'ready';
  const copy = {
    conflict: t('controls.conflict'),
    error: t('controls.error'),
    loading: t('controls.loading'),
    off: t('values.off'),
    on: t('values.on'),
    reconcile: t('controls.reconcile'),
    reset: t('controls.reset'),
    unknown: t('controls.unknown_outcome'),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Flag className="h-5 w-5 text-primary" />
        <h1 className="font-bold text-2xl">{t('title')}</h1>
      </div>

      {storage.status === 'unavailable' ? (
        <p className="text-muted-foreground text-sm">
          {t('controls.storage_unavailable')}
        </p>
      ) : null}

      <form>
        <label className="flex flex-col gap-1 text-muted-foreground text-xs">
          {t('filter.label')}
          <input
            className="rounded-md border border-border bg-background px-2 py-1 text-foreground text-sm"
            defaultValue={query}
            name="q"
            placeholder={t('filter.placeholder')}
            type="search"
          />
        </label>
      </form>

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

      {groups.map((group) => (
        <FeatureFlagsTable
          controlFor={
            canMutate
              ? (row, state) =>
                  row.mutable ? (
                    <FeatureFlagToggle
                      copy={copy}
                      declaredDefault={state.declaredDefault}
                      environment={state.environment}
                      expectedRevision={state.revision}
                      flagKey={row.key}
                      overrideEnabled={state.overrideEnabled}
                    />
                  ) : null
              : undefined
          }
          group={group}
          key={group.family}
          secretsHref={`/${wsId}/workspaces`}
          t={t}
        />
      ))}

      <FeatureFlagAudit
        rows={audit.status === 'ready' ? audit.rows : []}
        t={t}
        unavailable={audit.status !== 'ready'}
      />
    </div>
  );
}
