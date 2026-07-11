'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  CircleHelp,
  ListFilter,
  Loader2,
  MinusCircle,
  PlusCircle,
  RotateCcw,
  User,
} from '@tuturuuu/icons';
import { getPostsFilterOptions } from '@tuturuuu/internal-api/settings';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { Filter } from '@tuturuuu/ui/custom/user-filters';
import { DateRangeFilterWrapper } from '@tuturuuu/ui/finance/shared/date-range-filter-wrapper';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useQueryStates } from 'nuqs';
import { useMemo } from 'react';
import { postsSearchParamParsers } from './search-params';
import {
  getPostApprovalStatusAppearance,
  getPostEmailStatusAppearance,
  getPostReviewStageAppearance,
  POST_APPROVAL_STATUS_ORDER,
  POST_EMAIL_STATUS_ORDER,
  POST_REVIEW_STAGE_ORDER,
} from './status-meta';
import type {
  PostApprovalStatus,
  PostEmailQueueStatus,
  PostEmailStatusSummary,
  PostReviewStage,
  PostsSearchParams,
} from './types';
import { DEFAULT_POST_REVIEW_STAGE } from './types';

export default function PostsFilters({
  wsId,
  statusSummary,
  defaultDateRange,
  noInclude = false,
  noExclude = false,
  onRefreshPosts,
  isRefreshing = false,
}: {
  wsId: string;
  statusSummary: PostEmailStatusSummary;
  defaultDateRange: {
    start: string;
    end: string;
  };
  noInclude?: boolean;
  noExclude?: boolean;
  onRefreshPosts?: () => void;
  isRefreshing?: boolean;
}) {
  const t = useTranslations();
  const [queryState, setQueryState] = useQueryStates(postsSearchParamParsers);

  const includedGroupIds = queryState.includedGroups ?? [];

  const { data } = useQuery({
    queryKey: ['posts-filter-options', wsId, ...includedGroupIds],
    queryFn: () =>
      getPostsFilterOptions(wsId, {
        includedGroups: includedGroupIds,
      }),
    staleTime: 60_000,
  });

  const userGroups = (data?.userGroups as UserGroup[] | undefined) ?? [];
  const excludedUserGroups =
    (data?.excludedUserGroups as UserGroup[] | undefined) ?? [];
  const users = (data?.users as WorkspaceUser[] | undefined) ?? [];
  const hasNonDefaultDateRange =
    (queryState.start ?? defaultDateRange.start) !== defaultDateRange.start ||
    (queryState.end ?? defaultDateRange.end) !== defaultDateRange.end;

  const hasAnyFilters = useMemo(
    () =>
      Boolean(
        (queryState.stage && queryState.stage !== DEFAULT_POST_REVIEW_STAGE) ||
          queryState.showAll ||
          queryState.approvalStatus ||
          queryState.queueStatus ||
          hasNonDefaultDateRange ||
          queryState.userId ||
          (queryState.includedGroups?.length ?? 0) > 0 ||
          (queryState.excludedGroups?.length ?? 0) > 0
      ),
    [hasNonDefaultDateRange, queryState]
  );

  const setPageOne = (values: Partial<PostsSearchParams>) =>
    setQueryState({
      ...values,
      page: 1,
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter
        key="stage-filter"
        title={t('post-email-data-table.stage')}
        icon={<CircleHelp className="mr-2 h-4 w-4" />}
        multiple={false}
        defaultValues={queryState.stage ? [queryState.stage] : []}
        onSet={(values) =>
          void setPageOne({
            showAll: null,
            stage: (values[0] as PostReviewStage | undefined) ?? null,
          })
        }
        options={POST_REVIEW_STAGE_ORDER.map((stage) => {
          const appearance = getPostReviewStageAppearance(stage);
          const Icon = appearance.icon;

          return {
            label: t(`post-email-data-table.${appearance.labelKey}`),
            value: stage,
            count: statusSummary.stages[stage],
            icon: <Icon className={cn('h-4 w-4', appearance.iconClassName)} />,
          };
        })}
      />
      <Filter
        key="approval-status-filter"
        title={t('post-email-data-table.approval_status')}
        icon={<CheckCircle2 className="mr-2 h-4 w-4" />}
        multiple={false}
        defaultValues={
          queryState.approvalStatus ? [queryState.approvalStatus] : []
        }
        onSet={(values) =>
          void setPageOne({
            approvalStatus:
              (values[0] as PostApprovalStatus | undefined) ?? null,
          })
        }
        options={POST_APPROVAL_STATUS_ORDER.map((status) => {
          const appearance = getPostApprovalStatusAppearance(status);
          const Icon = appearance.icon;

          return {
            label: t(`post-email-data-table.${appearance.labelKey}`),
            value: status,
            count:
              status === 'APPROVED'
                ? statusSummary.approvals.approved
                : status === 'REJECTED'
                  ? statusSummary.approvals.rejected
                  : statusSummary.approvals.pending,
            icon: <Icon className="h-4 w-4" />,
          };
        })}
      />
      <Filter
        key="queue-status-filter"
        title={t('post-email-data-table.queue_status')}
        icon={<ListFilter className="mr-2 h-4 w-4" />}
        multiple={false}
        defaultValues={queryState.queueStatus ? [queryState.queueStatus] : []}
        onSet={(values) =>
          void setPageOne({
            queueStatus:
              (values[0] as PostEmailQueueStatus | undefined) ?? null,
          })
        }
        options={POST_EMAIL_STATUS_ORDER.map((status) => {
          const appearance = getPostEmailStatusAppearance(status);
          const Icon = appearance.icon;

          return {
            label: t(`post-email-data-table.${appearance.labelKey}`),
            value: status,
            count: statusSummary.queue[status],
            icon: <Icon className={cn('h-4 w-4', appearance.iconClassName)} />,
          };
        })}
      />
      {noInclude ? null : (
        <Filter
          key="included-user-groups-filter"
          title={t('user-data-table.included_groups')}
          icon={<PlusCircle className="mr-2 h-4 w-4" />}
          defaultValues={queryState.includedGroups ?? []}
          onSet={(values) =>
            void setPageOne({
              includedGroups: values,
            })
          }
          options={userGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
        />
      )}
      {noExclude ? null : (
        <Filter
          key="excluded-user-groups-filter"
          title={t('user-data-table.excluded_groups')}
          icon={<MinusCircle className="mr-2 h-4 w-4" />}
          defaultValues={queryState.excludedGroups ?? []}
          onSet={(values) =>
            void setPageOne({
              excludedGroups: values,
            })
          }
          options={excludedUserGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
        />
      )}
      <Filter
        key="user-filter"
        title={t('user-data-table.user')}
        icon={<User className="mr-2 h-4 w-4" />}
        multiple={false}
        defaultValues={queryState.userId ? [queryState.userId] : []}
        onSet={(values) =>
          void setPageOne({
            userId: values[0] ?? null,
          })
        }
        options={users.map((user) => ({
          label: user.full_name || 'No name',
          value: user.id,
        }))}
      />
      <DateRangeFilterWrapper shallow />
      <Button
        variant="outline"
        size="sm"
        onClick={() => onRefreshPosts?.()}
        disabled={isRefreshing}
        className="h-8"
      >
        {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {t('common.refresh')}
      </Button>
      {hasAnyFilters ? (
        <Button
          variant="secondary"
          size="sm"
          className="h-8"
          onClick={() =>
            void setQueryState({
              approvalStatus: null,
              excludedGroups: null,
              includedGroups: null,
              page: 1,
              queueStatus: null,
              start: null,
              end: null,
              showAll: null,
              stage: DEFAULT_POST_REVIEW_STAGE,
              userId: null,
            })
          }
        >
          {t('common.reset')}
          <RotateCcw className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
