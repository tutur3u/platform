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
      <DialogContent className="max-h-[min(calc(100vh-2rem),900px)] max-w-5xl overflow-hidden">
        {record ? (
          <>
            <DialogHeader>
              <DialogTitle>{record.jobId}</DialogTitle>
            </DialogHeader>
            <div className="min-h-0 overflow-y-auto pr-1">
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
                    <p className="mt-2 break-words font-medium text-sm">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid min-h-0 gap-4 lg:grid-cols-2">
                <div className="min-w-0">
                  <p className="mb-2 font-medium text-sm">
                    {t('cron.detail.response')}
                  </p>
                  <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                    {record.error ||
                      record.response ||
                      t('cron.detail.empty_response')}
                  </pre>
                </div>
                <div className="min-w-0">
                  <p className="mb-2 font-medium text-sm">
                    {t('cron.detail.console_logs')}
                  </p>
                  <div className="max-h-[55vh] overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3">
                    {record.consoleLogs.length > 0 ? (
                      record.consoleLogs.map((log) => (
                        <div
                          key={`${log.time}-${log.source}-${log.message}`}
                          className="border-border/50 border-b py-2 last:border-b-0"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-xs">
                            <span>{formatClockTime(log.time)}</span>
                            <span>{log.level}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
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
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
