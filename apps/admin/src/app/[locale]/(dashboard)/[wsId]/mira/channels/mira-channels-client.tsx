'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getMiraGlobalStop,
  listMiraAuditEvents,
  listMiraOperatorTenants,
} from '@tuturuuu/internal-api/infrastructure/mira';
import { Badge } from '@tuturuuu/ui/badge';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useLocale, useTranslations } from 'next-intl';
import { MiraAuditTable } from './mira-audit-table';
import { formatDateTime } from './mira-channels-format';
import { MiraTenantsTable } from './mira-tenants-table';

const QUERY_KEY = ['infrastructure', 'mira-channels'] as const;

function QueryState({ isError }: { isError: boolean }) {
  const t = useTranslations('mira-channels');
  return isError ? (
    <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
      {t('load_failed')}
    </p>
  ) : (
    <Skeleton className="h-24 w-full" />
  );
}

function GlobalStopBanner() {
  const t = useTranslations('mira-channels');
  const locale = useLocale();
  const query = useQuery({
    queryKey: [...QUERY_KEY, 'global-stop'],
    queryFn: () => getMiraGlobalStop(),
    refetchInterval: 15_000,
  });

  if (!query.data) return <QueryState isError={query.isError} />;
  const { stopped, generation, updatedAt } = query.data;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
      <span className="font-medium">{t('global_stop')}</span>
      <Badge variant={stopped ? 'destructive' : 'secondary'}>
        {stopped ? t('stopped') : t('running')}
      </Badge>
      <span className="text-muted-foreground text-sm">
        {t('generation', { generation })}
        {' · '}
        {formatDateTime(updatedAt, locale)}
      </span>
    </div>
  );
}

export function MiraChannelsClient() {
  const t = useTranslations('mira-channels');
  const tenants = useQuery({
    queryKey: [...QUERY_KEY, 'tenants'],
    queryFn: () => listMiraOperatorTenants({ limit: 100 }),
    refetchInterval: 30_000,
  });
  const audit = useQuery({
    queryKey: [...QUERY_KEY, 'audit'],
    queryFn: () => listMiraAuditEvents({ limit: 50 }),
    refetchInterval: 30_000,
  });

  return (
    <div className="flex flex-col gap-6">
      <GlobalStopBanner />
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-lg">{t('tenants')}</h2>
        {tenants.data ? (
          <MiraTenantsTable
            metrics={tenants.data.metrics}
            tenants={tenants.data.tenants}
          />
        ) : (
          <QueryState isError={tenants.isError} />
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-lg">{t('audit')}</h2>
        {audit.data ? (
          <MiraAuditTable events={audit.data.events} />
        ) : (
          <QueryState isError={audit.isError} />
        )}
      </section>
    </div>
  );
}
