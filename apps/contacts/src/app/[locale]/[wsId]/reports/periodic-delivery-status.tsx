'use client';

import { useQuery } from '@tanstack/react-query';
import { getPeriodicReportDeliveryDiagnostics } from '@tuturuuu/internal-api/reports';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useFormatter, useTranslations } from 'next-intl';

export function PeriodicDeliveryStatus({
  wsId,
  reportId,
}: {
  wsId: string;
  reportId: string;
}) {
  const t = useTranslations('reports-hub');
  const format = useFormatter();
  const query = useQuery({
    queryKey: ['periodic-report-delivery', wsId, reportId],
    queryFn: () => getPeriodicReportDeliveryDiagnostics(wsId, reportId),
    refetchInterval: 10_000,
  });
  if (query.isPending)
    return (
      <p role="status" className="text-muted-foreground text-xs">
        {t('delivery_loading')}
      </p>
    );
  if (query.isError)
    return (
      <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
        {t('retry')}
      </Button>
    );
  const { report, queue, attempts } = query.data;
  const date = (value: string) =>
    format.dateTime(new Date(value), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  return (
    <section className="space-y-3" aria-label={t('delivery')}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-sm">{t('delivery')}</h3>
        <Badge variant="outline">{t(`status_${report.delivery_status}`)}</Badge>
      </div>
      <p className="break-words text-xs">
        {t('preview_recipient', {
          email:
            queue?.recipient_email ?? report.user_email ?? t('missing_email'),
        })}
      </p>
      <p className="text-muted-foreground text-xs">{t('sent_explanation')}</p>
      {queue?.delivery_kind === 'test' && (
        <Badge variant="secondary">{t('test_send')}</Badge>
      )}
      {report.delivered_at && (
        <p className="text-xs">
          {t('delivery_sent_at', { date: date(report.delivered_at) })}
        </p>
      )}
      {queue && (
        <p className="text-muted-foreground text-xs">
          {t('delivery_attempt_count', { count: queue.attempt_count })}
        </p>
      )}
      {queue && ['queued', 'failed'].includes(queue.status) && (
        <p className="text-xs">
          {t('delivery_next_attempt', { date: date(queue.next_attempt_at) })}
        </p>
      )}
      {report.last_delivery_error && (
        <p className="break-words text-destructive text-xs">
          {report.last_delivery_error}
        </p>
      )}
      {attempts.length > 0 && (
        <details className="rounded-md border p-2">
          <summary className="cursor-pointer text-xs">
            {t('delivery_history')}
          </summary>
          <ol className="mt-2 space-y-3">
            {attempts.map((attempt) => (
              <li key={attempt.id} className="space-y-1 text-xs">
                <p>
                  {t(`status_${attempt.status}`)} · {date(attempt.attempted_at)}
                </p>
                {attempt.error_message && (
                  <p className="break-words text-destructive">
                    {attempt.error_message}
                  </p>
                )}
                {attempt.provider_message_id && (
                  <p className="break-all text-muted-foreground">
                    {attempt.provider_message_id}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
