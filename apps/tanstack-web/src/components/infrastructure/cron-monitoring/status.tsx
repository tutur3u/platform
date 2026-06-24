'use client';

import { Activity, CheckCircle2, Clock, Radio, XCircle } from '@tuturuuu/icons';
import type {
  CronExecutionStatus,
  CronRunRecord,
  CronRunStatus,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import type { useTranslations } from 'next-intl';

export type CronMonitoringTranslations = ReturnType<typeof useTranslations>;

export function isCronRunInFlight(run: CronRunRecord | null | undefined) {
  return run?.status === 'queued' || run?.status === 'processing';
}

export function getExecutionStatusIcon(
  status: CronExecutionStatus | null | undefined
) {
  if (status === 'success') {
    return <CheckCircle2 className="h-4 w-4 text-dynamic-green" />;
  }

  if (status === 'timeout') {
    return <Clock className="h-4 w-4 text-dynamic-yellow" />;
  }

  if (status === 'failed') {
    return <XCircle className="h-4 w-4 text-dynamic-red" />;
  }

  return <Radio className="h-4 w-4 text-muted-foreground" />;
}

export function getRunStatusIcon(status: CronRunStatus | null | undefined) {
  if (status === 'success') {
    return <CheckCircle2 className="h-4 w-4 text-dynamic-green" />;
  }

  if (status === 'processing') {
    return <Activity className="h-4 w-4 animate-pulse text-dynamic-blue" />;
  }

  if (status === 'queued') {
    return <Clock className="h-4 w-4 text-dynamic-yellow" />;
  }

  if (status === 'timeout' || status === 'failed') {
    return <XCircle className="h-4 w-4 text-dynamic-red" />;
  }

  return <Radio className="h-4 w-4 text-muted-foreground" />;
}

export function getExecutionStatusLabel(
  t: CronMonitoringTranslations,
  status: CronExecutionStatus | null | undefined
) {
  if (status === 'failed') return t('cron.execution_status.failed');
  if (status === 'skipped') return t('cron.execution_status.skipped');
  if (status === 'success') return t('cron.execution_status.success');
  if (status === 'timeout') return t('cron.execution_status.timeout');

  return t('cron.states.pending');
}

export function getRunStatusLabel(
  t: CronMonitoringTranslations,
  status: CronRunStatus | null | undefined
) {
  if (status === 'success') return t('cron.run_status.done');
  if (status === 'processing') return t('cron.run_status.processing');
  if (status === 'queued') return t('cron.run_status.queued');
  if (status === 'failed' || status === 'timeout') {
    return t('cron.run_status.errored');
  }
  if (status === 'skipped') return t('cron.run_status.skipped');

  return t('cron.states.pending');
}

export function getRunStatusBadgeClass(
  status: CronRunStatus | null | undefined
) {
  if (status === 'success') {
    return 'border-dynamic-green/35 bg-dynamic-green/10 text-dynamic-green';
  }

  if (status === 'processing') {
    return 'border-dynamic-blue/35 bg-dynamic-blue/10 text-dynamic-blue';
  }

  if (status === 'queued') {
    return 'border-dynamic-yellow/35 bg-dynamic-yellow/10 text-dynamic-yellow';
  }

  if (status === 'failed' || status === 'timeout') {
    return 'border-dynamic-red/35 bg-dynamic-red/10 text-dynamic-red';
  }

  return 'border-border text-muted-foreground';
}
