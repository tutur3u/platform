'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MailCheck, MailWarning, Settings2 } from '@tuturuuu/icons';
import { getPeriodicReportSchedules } from '@tuturuuu/internal-api/reports';
import { Button } from '@tuturuuu/ui/button';
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

export function PeriodicEmailReadiness({ wsId }: { wsId: string }) {
  const t = useTranslations('reports-hub');
  const actor = useWorkspaceActor();
  const client = useQueryClient();
  const [instance] = useState(() => crypto.randomUUID());
  const lease = useRef({ actor, epoch: 0 });
  if (lease.current.actor !== actor)
    lease.current = { actor, epoch: lease.current.epoch + 1 };
  const epoch = lease.current.epoch;
  useEffect(
    () => () => {
      client.removeQueries({
        queryKey: ['periodic-report-schedules', wsId, instance, epoch],
      });
    },
    [client, wsId, instance, epoch]
  );
  const query = useQuery({
    queryKey: ['periodic-report-schedules', wsId, instance, epoch],
    enabled: Boolean(actor),
    queryFn: async () => {
      if (!actor) throw new Error('Workspace account unavailable');
      actor.assertActive();
      const result = await getPeriodicReportSchedules(wsId);
      actor.assertActive();
      return result;
    },
    staleTime: 15_000,
  });
  if (!actor || query.isPending) return <Skeleton className="h-11 w-full" />;
  if (query.isError)
    return (
      <div
        role="status"
        className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
      >
        <p className="text-muted-foreground text-xs">
          {t('readiness_unavailable')}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void query.refetch()}
        >
          {t('retry')}
        </Button>
      </div>
    );
  const delivery = query.data.emailDelivery;
  const Icon = delivery.ready ? MailCheck : MailWarning;
  const missing = [
    !delivery.globalGateEnabled && t('email_global_gate_off'),
    !delivery.periodicGateEnabled && t('email_periodic_gate_off'),
    !delivery.senderConfigured && t('email_sender_missing'),
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-2 text-xs">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          {!delivery.senderConfigured
            ? t('email_sender_missing')
            : !delivery.ready
              ? t('email_sending_off')
              : delivery.autoSendAfterApproval
                ? t('email_automatic_ready')
                : t('email_manual_ready')}
        </p>
        {missing.length > 0 && (
          <>
            <ul className="list-inside list-disc text-muted-foreground text-xs">
              {missing.map((reason) => (
                <li key={String(reason)}>{reason}</li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              {t('email_contact_admin')}
            </p>
          </>
        )}
      </div>
      <Button asChild variant="ghost" size="sm">
        <Link href={`/${wsId}/reports?view=automations`}>
          <Settings2 className="size-3.5" />
          {t('email_settings')}
        </Link>
      </Button>
    </div>
  );
}
