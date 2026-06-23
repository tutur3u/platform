'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, Radio, ShieldAlert, ShieldCheck } from '@tuturuuu/icons';
import {
  type CreateAbuseTrustOverridePayload,
  createAbuseTrustOverride,
  getAbuseIntelligenceSnapshot,
  revokeAbuseTrustOverride,
} from '@tuturuuu/internal-api/infrastructure/abuse';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { formatPercent } from './abuse-intelligence-format';
import { AbuseOverrideControls } from './override-controls';
import { AbuseSignalsTable } from './signals-table';
import { AbuseSubjectsTable } from './subjects-table';

const QUERY_KEY = ['infrastructure', 'abuse-intelligence'];

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{label}</p>
        {icon}
      </div>
      <div className="mt-3 font-semibold text-2xl">{value}</div>
    </div>
  );
}

export function AbuseIntelligenceClient() {
  const t = useTranslations('abuse-intelligence');
  const queryClient = useQueryClient();
  const snapshotQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      getAbuseIntelligenceSnapshot({ limit: 120, signalLimit: 120 }),
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const createOverrideMutation = useMutation({
    mutationFn: (payload: CreateAbuseTrustOverridePayload) =>
      createAbuseTrustOverride(payload),
    onSuccess: () => {
      toast.success(t('toasts.override_created'));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: () => toast.error(t('toasts.override_create_failed')),
  });

  const revokeOverrideMutation = useMutation({
    mutationFn: (overrideId: string) =>
      revokeAbuseTrustOverride(overrideId, {
        reason: t('overrides.revoke_reason'),
      }),
    onSuccess: () => {
      toast.success(t('toasts.override_revoked'));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: () => toast.error(t('toasts.override_revoke_failed')),
  });

  if (snapshotQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-border bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (snapshotQuery.isError || !snapshotQuery.data) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <p className="font-medium">{t('error.title')}</p>
        <p className="text-muted-foreground text-sm">
          {t('error.description')}
        </p>
        <Button onClick={() => snapshotQuery.refetch()} variant="secondary">
          {t('actions.retry')}
        </Button>
      </div>
    );
  }

  const snapshot = snapshotQuery.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<ShieldCheck className="h-5 w-5 text-dynamic-green" />}
          label={t('metrics.trusted')}
          value={snapshot.summary.trustedSubjectCount}
        />
        <MetricCard
          icon={<ShieldAlert className="h-5 w-5 text-dynamic-orange" />}
          label={t('metrics.watched')}
          value={snapshot.summary.watchedSubjectCount}
        />
        <MetricCard
          icon={<Bot className="h-5 w-5 text-dynamic-red" />}
          label={t('metrics.restricted')}
          value={snapshot.summary.restrictedSubjectCount}
        />
        <MetricCard
          icon={<Radio className="h-5 w-5 text-primary" />}
          label={t('metrics.challenge_pass_rate')}
          value={formatPercent(snapshot.summary.challengePassRate)}
        />
      </div>

      <AbuseOverrideControls
        isCreating={createOverrideMutation.isPending}
        isRevoking={revokeOverrideMutation.isPending}
        onCreate={(payload) => createOverrideMutation.mutate(payload)}
        onRevoke={(overrideId) => revokeOverrideMutation.mutate(overrideId)}
        overrides={snapshot.overrides}
      />

      <Separator />

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-xl">{t('sections.subjects')}</h2>
          <p className="text-muted-foreground text-sm">
            {t('sections.subjects_description')}
          </p>
        </div>
        <AbuseSubjectsTable subjects={snapshot.subjects} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-xl">{t('sections.signals')}</h2>
          <p className="text-muted-foreground text-sm">
            {t('sections.signals_description')}
          </p>
        </div>
        <AbuseSignalsTable signals={snapshot.signals} />
      </section>
    </div>
  );
}
