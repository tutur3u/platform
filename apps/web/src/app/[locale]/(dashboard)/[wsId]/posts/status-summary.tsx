'use client';

import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import useSearchParams from '@tuturuuu/ui/hooks/useSearchParams';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  getPostEmailStatusAppearance,
  POST_EMAIL_STATUS_ORDER,
} from './status-meta';
import type { PostEmailQueueStatus, PostEmailStatusSummary } from './types';

function getStatusPercentage(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

export function PostStatusSummary({
  activeStatus,
  filteredCount,
  summary,
}: {
  activeStatus?: PostEmailQueueStatus;
  filteredCount: number;
  summary: PostEmailStatusSummary;
}) {
  const searchParams = useSearchParams();
  const t = useTranslations('ws-post-emails');
  const tableT = useTranslations('post-email-data-table');

  const toggleStatus = (status: PostEmailQueueStatus) => {
    searchParams.set({
      page: '1',
      queueStatus: activeStatus === status ? undefined : status,
    });
  };

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardContent className="p-0">
        <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.8fr)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs uppercase tracking-[0.24em]">
                {t('status_overview')}
              </p>
              <div>
                <p className="text-muted-foreground text-sm">
                  {t('total_deliveries')}
                </p>
                <p className="font-semibold text-4xl tracking-tight">
                  {summary.total}
                </p>
              </div>
              <p className="max-w-md text-muted-foreground text-sm leading-6">
                {t('status_overview_description')}
              </p>
              <p className="text-muted-foreground text-sm">
                {t('matching_deliveries', {
                  filtered: filteredCount,
                  total: summary.total,
                })}
              </p>
            </div>

            {activeStatus ? (
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  searchParams.set({
                    page: '1',
                    queueStatus: undefined,
                  })
                }
              >
                {t('clear_status_filter')}
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {POST_EMAIL_STATUS_ORDER.map((status) => {
              const count = summary[status];
              const percentage = getStatusPercentage(count, summary.total);
              const appearance = getPostEmailStatusAppearance(status);
              const Icon = appearance.icon;
              const isActive = activeStatus === status;

              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  className={cn(
                    'group rounded-2xl border bg-background px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-sm',
                    isActive
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                      : 'border-border/70'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        'inline-flex h-10 w-10 items-center justify-center rounded-xl border',
                        appearance.className
                      )}
                    >
                      <Icon
                        className={cn('h-4 w-4', appearance.iconClassName)}
                      />
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {percentage}%
                    </span>
                  </div>
                  <div className="mt-4 space-y-1">
                    <p className="font-medium text-sm">
                      {tableT(appearance.labelKey)}
                    </p>
                    <p className="font-semibold text-2xl tracking-tight">
                      {count}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
