'use client';
import { useQuery } from '@tanstack/react-query';
import { MailCheck, MailWarning, Settings2 } from '@tuturuuu/icons';
import { getPeriodicReportSchedules } from '@tuturuuu/internal-api/reports';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function PeriodicEmailReadiness({ wsId }: { wsId: string }) {
  const t = useTranslations('reports-hub');
  const query = useQuery({
    queryKey: ['periodic-report-schedules', wsId],
    queryFn: () => getPeriodicReportSchedules(wsId),
    staleTime: 15_000,
  });
  if (!query.data) return null;
  const delivery = query.data.emailDelivery;
  const Icon = delivery.ready ? MailCheck : MailWarning;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
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
      <Button asChild variant="ghost" size="sm">
        <Link href={`/${wsId}/reports?view=automations`}>
          <Settings2 className="size-3.5" />
          {t('email_settings')}
        </Link>
      </Button>
    </div>
  );
}
