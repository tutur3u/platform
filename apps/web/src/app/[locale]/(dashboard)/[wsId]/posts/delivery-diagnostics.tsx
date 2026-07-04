'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Mail,
  XCircle,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import type { PostEmail } from './types';

type DiagnosticItem = {
  label: string;
  value: string;
};

function formatDate(value?: Date | string | null) {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : null;
}

function getQueueAgeHours(postEmail: PostEmail) {
  if (postEmail.queue_status !== 'queued' || !postEmail.queue_created_at) {
    return null;
  }

  const queuedAt = dayjs(postEmail.queue_created_at);
  if (!queuedAt.isValid()) return null;
  return dayjs().diff(queuedAt, 'hour', true);
}

function formatQueueAge(hours: number, t: ReturnType<typeof useTranslations>) {
  if (hours < 1) {
    return t('queue_age_minutes', {
      count: Math.max(Math.round(hours * 60), 1),
    });
  }

  return t('queue_age_hours', {
    count: Math.round(hours * 10) / 10,
  });
}

export function DeliveryDiagnostics({ postEmail }: { postEmail: PostEmail }) {
  const locale = useLocale();
  const t = useTranslations('post-email-data-table');

  useEffect(() => {
    dayjs.locale(locale);
  }, [locale]);

  const queueAgeHours = getQueueAgeHours(postEmail);
  const staleLevel =
    queueAgeHours != null && queueAgeHours >= 24
      ? 'critical'
      : queueAgeHours != null && queueAgeHours >= 1
        ? 'warning'
        : null;
  const diagnostics: DiagnosticItem[] = [
    {
      label: t('check_recorded_at'),
      value: formatDate(postEmail.created_at) ?? t('not_available'),
    },
    {
      label: t('approved_at'),
      value: formatDate(postEmail.approval_approved_at) ?? t('not_available'),
    },
    {
      label: t('rejected_at'),
      value: formatDate(postEmail.approval_rejected_at) ?? t('not_available'),
    },
    {
      label: t('queued_at'),
      value: formatDate(postEmail.queue_created_at) ?? t('not_available'),
    },
    {
      label: t('last_attempt_at'),
      value: formatDate(postEmail.queue_last_attempt_at) ?? t('not_available'),
    },
    {
      label: t('sent_at'),
      value: formatDate(postEmail.queue_sent_at) ?? t('not_available'),
    },
    {
      label: t('skipped_at'),
      value: formatDate(postEmail.queue_skipped_at) ?? t('not_available'),
    },
    {
      label: t('attempts'),
      value: String(postEmail.queue_attempt_count ?? 0),
    },
  ];

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{t('delivery_diagnostics')}</p>
          <p className="text-muted-foreground text-xs">
            {t('delivery_diagnostics_description')}
          </p>
        </div>
        {queueAgeHours != null ? (
          <Badge
            variant="outline"
            className={cn(
              'gap-1',
              staleLevel === 'critical'
                ? 'border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red'
                : staleLevel === 'warning'
                  ? 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange'
                  : 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green'
            )}
          >
            <Clock3 className="h-3.5 w-3.5" />
            {formatQueueAge(queueAgeHours, t)}
          </Badge>
        ) : null}
      </div>

      {staleLevel ? (
        <div
          className={cn(
            'flex gap-2 rounded-md border p-2 text-sm',
            staleLevel === 'critical'
              ? 'border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red'
              : 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange'
          )}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {staleLevel === 'critical'
              ? t('stale_queue_critical')
              : t('stale_queue_warning')}
          </p>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {diagnostics.map((item) => (
          <div
            key={item.label}
            className="rounded-md border bg-background/70 p-2"
          >
            <p className="text-muted-foreground text-xs">{item.label}</p>
            <p className="mt-0.5 font-medium text-sm">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-dynamic-green" />
          {t('approved')}
        </span>
        <span className="inline-flex items-center gap-1">
          <Mail className="h-3.5 w-3.5 text-dynamic-blue" />
          {t('delivery_status')}
        </span>
        <span className="inline-flex items-center gap-1">
          <XCircle className="h-3.5 w-3.5 text-dynamic-red" />
          {t('failed')}
        </span>
      </div>
    </div>
  );
}
