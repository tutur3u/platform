'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useQueryStates } from 'nuqs';
import type { ReactNode } from 'react';
import {
  ReportStatusCard,
  ReportStatusDashboard,
} from '../reports/report-status-dashboard';
import { postsSearchParamParsers } from './search-params';
import {
  getPostReviewStageAppearance,
  POST_REVIEW_STAGE_ORDER,
} from './status-meta';
import type { PostEmailStatusSummary, PostReviewStage } from './types';
import { DEFAULT_POST_REVIEW_STAGE } from './types';

export function PostStatusSummary({
  activeStage,
  summary,
  toolbar,
}: {
  activeStage?: PostReviewStage;
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
    <ReportStatusDashboard
      total={summary.total}
      totalLabel={t('total_recipients')}
      toolbar={toolbar}
      actions={
        <>
          {!isShowingAllRecipients && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void setQueryState({
                  page: 1,
                  showAll: true,
                  stage: null,
                })
              }
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
                  showAll: null,
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
        </>
      }
    >
      {POST_REVIEW_STAGE_ORDER.map((stage) => {
        const appearance = getPostReviewStageAppearance(stage);
        return (
          <ReportStatusCard
            key={stage}
            label={tableT(appearance.labelKey)}
            count={summary.stages[stage]}
            total={summary.total}
            active={activeStage === stage}
            appearance={appearance}
            onClick={() =>
              void setQueryState({ page: 1, showAll: null, stage })
            }
          />
        );
      })}
    </ReportStatusDashboard>
  );
}
