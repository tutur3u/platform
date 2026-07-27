'use client';

import { Calendar, Mail, Sparkles, User, Users } from '@tuturuuu/icons';
import type { PeriodicReport } from '@tuturuuu/internal-api/reports';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';

export interface PeriodicEmailPreview {
  content: string;
  feedback: string;
  recipient: string | null;
  title: string;
}

export function PeriodicReportPreviewDialog({
  emailPreview,
  onOpenChange,
  report,
}: {
  emailPreview?: PeriodicEmailPreview | null;
  onOpenChange: (open: boolean) => void;
  report: PeriodicReport | null;
}) {
  const t = useTranslations('reports-hub');
  const content = emailPreview?.content ?? report?.content;
  const feedback = emailPreview?.feedback ?? report?.feedback;
  const recipient = emailPreview?.recipient ?? report?.user_email;

  return (
    <Dialog open={Boolean(report)} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(92dvh,60rem)] sm:max-h-[calc(100dvh-1rem)] sm:w-[calc(100vw-1rem)] sm:max-w-7xl sm:rounded-xl sm:border">
        <DialogHeader className="shrink-0 gap-1 border-b px-4 py-4 pr-12 text-left sm:px-6 sm:py-5 sm:pr-14">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="min-w-0 truncate">
              {emailPreview?.title ?? report?.title}
            </DialogTitle>
            {emailPreview ? (
              <Badge variant="outline">
                <Mail className="mr-1 h-3.5 w-3.5" />
                {t('preview')}
              </Badge>
            ) : null}
          </div>
          <DialogDescription>
            {t('preview_recipient', {
              email: recipient ?? t('missing_email'),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_20rem]">
          <ScrollArea className="min-h-0 border-b md:border-r md:border-b-0">
            <div className="space-y-5 p-4 sm:p-6">
              <section className="rounded-xl border border-border/60 bg-card p-4 sm:p-6">
                <p className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  {t('report_content')}
                </p>
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {content}
                </p>
              </section>
              {feedback ? (
                <section className="rounded-xl border border-border/60 bg-card p-4 sm:p-6">
                  <p className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
                    {t('report_feedback')}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-7">
                    {feedback}
                  </p>
                </section>
              ) : null}
            </div>
          </ScrollArea>

          <ScrollArea className="min-h-0">
            <div className="space-y-5 p-4 sm:p-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {report?.report_approval_status}
                </Badge>
                <Badge variant="outline">{report?.delivery_status}</Badge>
                {report?.generation_mode === 'ai' ? (
                  <Badge variant="outline">
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    AI
                  </Badge>
                ) : null}
              </div>
              <Separator />
              <PreviewMeta
                icon={User}
                label={report?.user_name ?? t('unknown_member')}
                value={report?.user_email ?? t('missing_email')}
              />
              <PreviewMeta
                icon={Users}
                label={report?.group_name ?? t('unknown_group')}
                value={report ? t(report.cadence) : ''}
              />
              <PreviewMeta
                icon={Calendar}
                label={report?.cadence ?? ''}
                value={
                  report?.period_start && report.period_end
                    ? `${report.period_start} – ${report.period_end}`
                    : t('legacy_unscheduled')
                }
              />
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewMeta({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{label}</p>
        <p className="break-words text-muted-foreground text-xs">{value}</p>
      </div>
    </div>
  );
}
