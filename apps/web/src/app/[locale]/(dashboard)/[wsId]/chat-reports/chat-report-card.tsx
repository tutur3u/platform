'use client';

import {
  CHAT_REPORT_REASONS,
  type ChatReport,
  type ChatReportReviewStatus,
} from '@tuturuuu/internal-api/chat-reports';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

const ACTIONS = [
  ['reviewing', 'mark-reviewing'],
  ['actioned', 'mark-actioned'],
  ['dismissed', 'dismiss'],
] as const satisfies readonly (readonly [ChatReportReviewStatus, string])[];

export function ChatReportCard({
  report,
  pending,
  onReview,
}: {
  report: ChatReport;
  pending: boolean;
  onReview: (status: ChatReportReviewStatus, note: string) => void;
}) {
  const t = useTranslations('chat-reports');
  const noteId = useId();
  const [note, setNote] = useState('');
  const reason = CHAT_REPORT_REASONS.includes(report.reason)
    ? report.reason
    : 'other';
  const content = report.snapshot?.content;
  const previous = report.snapshot?.previousUserContent;

  return (
    <article
      aria-label={t(`subject-${report.subjectType}`)}
      className="min-w-0 space-y-3 rounded-md border p-4"
    >
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{t(`subject-${report.subjectType}`)}</Badge>
        <Badge variant={reason === 'other' ? 'secondary' : 'warning'}>
          {t(`reason-${reason}`)}
        </Badge>
        <Badge variant="secondary">{t(`status-${report.status}`)}</Badge>
        <time
          className="ml-auto text-muted-foreground text-xs"
          dateTime={report.createdAt}
        >
          {report.createdAt}
        </time>
      </header>
      <p className="break-words text-sm">
        <span className="font-medium">
          {report.reporterName ?? t('unknown-user')}
        </span>
        <span className="text-muted-foreground"> {t('reported')} </span>
        <span className="font-medium">
          {report.reportedName ??
            (report.subjectType === 'ai_response'
              ? t('assistant')
              : t('unknown-user'))}
        </span>
      </p>
      {report.subjectType === 'ai_response' && previous && (
        <section className="space-y-1">
          <h3 className="text-muted-foreground text-xs">
            {t('previous-user-content')}
          </h3>
          <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm">
            {previous}
          </p>
        </section>
      )}
      <section className="space-y-1">
        <h3 className="text-muted-foreground text-xs">
          {t('content')}
          {report.snapshot?.model ? ` · ${report.snapshot.model}` : ''}
        </h3>
        <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm">
          {content || t('no-content')}
        </p>
      </section>
      {report.details && (
        <section className="space-y-1">
          <h3 className="text-muted-foreground text-xs">{t('details')}</h3>
          <p className="whitespace-pre-wrap break-words text-sm">
            {report.details}
          </p>
        </section>
      )}
      {report.resolutionNote && (
        <section className="space-y-1">
          <h3 className="text-muted-foreground text-xs">
            {t('resolution-note')}
          </h3>
          <p className="whitespace-pre-wrap break-words text-sm">
            {report.resolutionNote}
          </p>
        </section>
      )}
      <div className="space-y-2">
        <label className="sr-only" htmlFor={noteId}>
          {t('note-label')}
        </label>
        <Textarea
          id={noteId}
          value={note}
          maxLength={2000}
          rows={2}
          placeholder={t('note-placeholder')}
          disabled={pending}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {ACTIONS.filter(([status]) => status !== report.status).map(
            ([status, label]) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={status === 'dismissed' ? 'outline' : 'default'}
                disabled={pending}
                onClick={() => onReview(status, note)}
              >
                {t(label)}
              </Button>
            )
          )}
        </div>
      </div>
    </article>
  );
}
