'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ChatReportReviewStatus,
  type ChatReportStatus,
  listChatReports,
  reviewChatReport,
} from '@tuturuuu/internal-api/chat-reports';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { Button } from '@tuturuuu/ui/button';
import { LoadingRegion, SkeletonCard } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ChatReportCard } from './chat-report-card';

const STATUSES = [
  'open',
  'reviewing',
  'actioned',
  'dismissed',
] as const satisfies readonly ChatReportStatus[];

export function ChatReportsInbox({ actor }: { actor: string }) {
  const t = useTranslations('chat-reports');
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ChatReportStatus>('open');
  const listKey = ['chat-reports', actor, 'list'] as const;
  const list = useQuery({
    queryKey: [...listKey, status],
    queryFn: () => listChatReports({ status, limit: 100 }),
    retry: false,
    gcTime: 0,
  });
  const review = useMutation({
    mutationFn: (input: {
      reportId: string;
      status: ChatReportReviewStatus;
      note: string;
    }) => reviewChatReport(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });
  const accessLost = [list.error, review.error].some(
    (error) =>
      error instanceof InternalApiError && [401, 403].includes(error.status)
  );

  return (
    <section className="space-y-4">
      <header>
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('private')}</p>
      </header>
      <div
        role="group"
        aria-label={t('status-filter')}
        className="flex flex-wrap items-center gap-2"
      >
        {STATUSES.map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={status === value ? 'default' : 'outline'}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {t(`status-${value}`)}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void list.refetch()}
        >
          {t('refresh')}
        </Button>
      </div>
      {accessLost ? (
        <p role="alert">{t('unavailable')}</p>
      ) : list.isError ? (
        <p role="alert">{t('load-error')}</p>
      ) : list.isPending ? (
        <LoadingRegion className="grid gap-4" srLabel={t('loading')}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </LoadingRegion>
      ) : list.data.reports.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <>
          {review.isError && (
            <p role="alert" className="text-dynamic-red text-sm">
              {t('review-error')}
            </p>
          )}
          <ul className="grid gap-4 lg:grid-cols-2">
            {list.data.reports.map((report) => (
              <li key={report.id} className="min-w-0">
                <ChatReportCard
                  report={report}
                  pending={
                    review.isPending && review.variables?.reportId === report.id
                  }
                  onReview={(nextStatus, note) =>
                    review.mutate({
                      reportId: report.id,
                      status: nextStatus,
                      note,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
