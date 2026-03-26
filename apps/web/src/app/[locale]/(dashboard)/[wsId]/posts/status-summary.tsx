'use client';

import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useQueryStates } from 'nuqs';
import { postsSearchParamParsers } from './search-params';
import {
  getPostReviewStageAppearance,
  POST_REVIEW_STAGE_ORDER,
} from './status-meta';
import type { PostEmailStatusSummary, PostReviewStage } from './types';
import { DEFAULT_POST_REVIEW_STAGE } from './types';

function getStatusPercentage(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

export function PostStatusSummary({
  activeStage,
  filteredCount,
  summary,
  toolbar,
}: {
  activeStage?: PostReviewStage;
  filteredCount: number;
  summary: PostEmailStatusSummary;
  toolbar?: ReactNode;
}) {
  const [queryState, setQueryState] = useQueryStates(postsSearchParamParsers);
  const t = useTranslations('ws-post-emails');
  const tableT = useTranslations('post-email-data-table');

  const isShowingAllRecipients = !activeStage;
  const isDefaultActionableView = activeStage === DEFAULT_POST_REVIEW_STAGE;

  const hasAdvancedFilters = Boolean(
    queryState.queueStatus || queryState.approvalStatus
  );

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardContent className="p-0">
        <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,2.15fr)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.24em]">
                {t('pipeline_overview')}
              </p>
              <div>
                <p className="text-muted-foreground text-sm">
                  {t('total_recipients')}
                </p>
                <p className="font-bold text-4xl tracking-tight">
                  {summary.total.toLocaleString()}
                </p>
              </div>
              <p className="text-muted-foreground text-sm">
                {t('matching_recipients', {
                  filtered: filteredCount,
                  total: summary.total,
                })}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {!isShowingAllRecipients && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void setQueryState({ page: 1, stage: null })}
                >
                  {t('show_all_recipients')}
                </Button>
              )}
              {!isDefaultActionableView && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() =>
                    void setQueryState({
                      page: 1,
                      stage: DEFAULT_POST_REVIEW_STAGE,
                    })
                  }
                >
                  {t('show_actionable_queue')}
                </Button>
              )}
              {hasAdvancedFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() =>
                    void setQueryState({
                      approvalStatus: null,
                      page: 1,
                      queueStatus: null,
                    })
                  }
                >
                  {t('clear_advanced_filters')}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  {t('current_stage')}
                </p>
                <div className="h-px flex-1 bg-border/60" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {POST_REVIEW_STAGE_ORDER.map((stage) => {
                  const count = summary.stages[stage];
                  const percentage = getStatusPercentage(count, summary.total);
                  const appearance = getPostReviewStageAppearance(stage);
                  const Icon = appearance.icon;
                  const isActive = activeStage === stage;

                  return (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => void setQueryState({ page: 1, stage })}
                      className={cn(
                        'group rounded-xl border bg-background px-3.5 py-3 text-left transition-all',
                        isActive
                          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                          : 'border-border/70 hover:border-border hover:shadow-sm'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            'inline-flex h-8 w-8 items-center justify-center rounded-lg border',
                            appearance.className
                          )}
                        >
                          <Icon
                            className={cn(
                              'h-3.5 w-3.5',
                              appearance.iconClassName
                            )}
                          />
                        </span>
                        {percentage > 0 && (
                          <span className="font-medium text-muted-foreground text-xs">
                            {percentage}%
                          </span>
                        )}
                      </div>
                      <div className="mt-2.5 space-y-0.5">
                        <p className="text-muted-foreground text-xs">
                          {tableT(appearance.labelKey)}
                        </p>
                        <p className="font-bold text-lg tracking-tight">
                          {count.toLocaleString()}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {toolbar ? (
          <div className="border-t border-border/60 px-6 py-4">{toolbar}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
