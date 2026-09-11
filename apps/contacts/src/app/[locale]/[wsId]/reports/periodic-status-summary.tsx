'use client';

import {
  Ban,
  CheckCircle2,
  Clock3,
  FileText,
  MailCheck,
  MailX,
} from '@tuturuuu/icons';
import type { PeriodicReportCounts } from '@tuturuuu/internal-api/reports';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type {
  PeriodicApprovalFilter,
  PeriodicDeliveryFilter,
} from './periodic-reports-toolbar';

export function PeriodicStatusSummary({
  counts,
  approval,
  delivery,
  onChange,
}: {
  counts?: PeriodicReportCounts;
  approval: PeriodicApprovalFilter;
  delivery: PeriodicDeliveryFilter;
  onChange: (
    approval: PeriodicApprovalFilter,
    delivery: PeriodicDeliveryFilter
  ) => void;
}) {
  const t = useTranslations('reports-hub');
  const stages = [
    {
      label: 'total',
      count: counts?.total,
      approval: 'all',
      delivery: 'all',
      icon: FileText,
    },
    {
      label: 'pending_review',
      count: counts?.pendingReview,
      approval: 'PENDING',
      delivery: 'all',
      icon: Clock3,
    },
    {
      label: 'approved',
      count: counts?.approved,
      approval: 'APPROVED',
      delivery: 'all',
      icon: CheckCircle2,
    },
    {
      label: 'status_sent',
      count: counts?.delivered,
      approval: 'all',
      delivery: 'sent',
      icon: MailCheck,
    },
    {
      label: 'failed',
      count: counts?.failed,
      approval: 'all',
      delivery: 'failed',
      icon: MailX,
    },
    {
      label: 'status_blocked',
      count: counts?.blocked,
      approval: 'all',
      delivery: 'blocked',
      icon: Ban,
    },
  ] as const;
  return (
    <section
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6"
      aria-label={t('report_status')}
    >
      {stages.map((stage) => {
        const active =
          approval === stage.approval && delivery === stage.delivery;
        return (
          <button
            key={stage.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(stage.approval, stage.delivery)}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-primary/40 bg-primary/5'
                : 'border-border/60 bg-background hover:bg-muted/50'
            )}
          >
            <stage.icon className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground text-xs">{t(stage.label)}</p>
              <p className="font-semibold text-xl tabular-nums tracking-tight">
                {counts ? (stage.count ?? 0).toLocaleString() : '—'}
              </p>
            </div>
          </button>
        );
      })}
    </section>
  );
}
