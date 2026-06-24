'use client';

import type {
  CronExecutionRecord,
  CronRunRecord,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { formatClockTime, formatDateTime, formatDuration } from './formatters';
import type { CronMonitoringTranslations } from './status';

type CronDetailRecord = CronExecutionRecord | CronRunRecord;

export function CronExecutionDetailDialog({
  duration,
  onOpenChange,
  record,
  startedAt,
  statusLabel,
  t,
}: {
  duration: number | null;
  onOpenChange: (open: boolean) => void;
  record: CronDetailRecord | null;
  startedAt: number | null;
  statusLabel: string;
  t: CronMonitoringTranslations;
}) {
  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        {record ? (
          <>
            <DialogHeader>
              <DialogTitle>{record.jobId}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 md:grid-cols-4">
              {[
                [t('cron.detail.status'), statusLabel],
                [
                  t('cron.detail.started'),
                  startedAt ? formatDateTime(startedAt) : '-',
                ],
                [
                  t('cron.detail.duration'),
                  duration == null ? '-' : formatDuration(duration),
                ],
                [
                  t('cron.detail.http_status'),
                  record.httpStatus?.toString() ?? '-',
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3"
                >
                  <p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                    {label}
                  </p>
                  <p className="mt-2 font-medium text-sm">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 font-medium text-sm">
                  {t('cron.detail.response')}
                </p>
                <pre className="max-h-80 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                  {record.error ||
                    record.response ||
                    t('cron.detail.empty_response')}
                </pre>
              </div>
              <div>
                <p className="mb-2 font-medium text-sm">
                  {t('cron.detail.console_logs')}
                </p>
                <div className="max-h-80 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3">
                  {record.consoleLogs.length > 0 ? (
                    record.consoleLogs.map((log) => (
                      <div
                        key={`${log.time}-${log.source}-${log.message}`}
                        className="border-border/50 border-b py-2 last:border-b-0"
                      >
                        <div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
                          <span>{formatClockTime(log.time)}</span>
                          <span>{log.level}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap font-mono text-xs">
                          {log.message}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {t('cron.detail.empty_console_logs')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
