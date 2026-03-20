'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ListFilter,
  MinusCircle,
  PlusCircle,
  User,
} from '@tuturuuu/icons';
import { getPostsFilterOptions } from '@tuturuuu/internal-api/settings';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Filter } from '../users/filters';
import {
  getPostApprovalStatusAppearance,
  getPostEmailStatusAppearance,
  POST_APPROVAL_STATUS_ORDER,
  POST_EMAIL_STATUS_ORDER,
} from './status-meta';
import type { PostEmailStatusSummary, PostsSearchParams } from './types';

export default function PostsFilters({
  wsId,
  searchParams,
  statusSummary,
  noInclude = false,
  noExclude = false,
}: {
  wsId: string;
  searchParams: PostsSearchParams;
  statusSummary: PostEmailStatusSummary;
  noInclude?: boolean;
  noExclude?: boolean;
}) {
  const t = useTranslations();
  const includedGroupIds = Array.isArray(searchParams.includedGroups)
    ? searchParams.includedGroups
    : searchParams.includedGroups
      ? [searchParams.includedGroups]
      : [];

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

  return (
    <>
      <Filter
        key="approval-status-filter"
        tag="approvalStatus"
        title={t('post-email-data-table.approval_status')}
        icon={<CheckCircle2 className="mr-2 h-4 w-4" />}
        multiple={false}
        extraQueryOnSet={{ page: '1' }}
        options={POST_APPROVAL_STATUS_ORDER.map((status) => {
          const appearance = getPostApprovalStatusAppearance(status);
          const Icon = appearance.icon;

          return {
            label: t(`post-email-data-table.${appearance.labelKey}`),
            value: status,
            count:
              status === 'APPROVED'
                ? statusSummary.approved
                : status === 'REJECTED'
                  ? statusSummary.rejected
                  : statusSummary.pending,
            icon: <Icon className="h-4 w-4" />,
          };
        })}
      />
      <Filter
        key="queue-status-filter"
        tag="queueStatus"
        title={t('post-email-data-table.queue_status')}
        icon={<ListFilter className="mr-2 h-4 w-4" />}
        multiple={false}
        extraQueryOnSet={{ page: '1' }}
        options={POST_EMAIL_STATUS_ORDER.map((status) => {
          const appearance = getPostEmailStatusAppearance(status);
          const Icon = appearance.icon;

          return {
            label: t(`post-email-data-table.${appearance.labelKey}`),
            value: status,
            count: statusSummary[status],
            icon: <Icon className={cn('h-4 w-4', appearance.iconClassName)} />,
          };
        })}
      />
      {noInclude || (
        <Filter
          key="included-user-groups-filter"
          tag="includedGroups"
          title={t('user-data-table.included_groups')}
          icon={<PlusCircle className="mr-2 h-4 w-4" />}
          extraQueryOnSet={{ page: '1' }}
          options={userGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
        />
      )}
      {noExclude || (
        <Filter
          key="excluded-user-groups-filter"
          tag="excludedGroups"
          title={t('user-data-table.excluded_groups')}
          icon={<MinusCircle className="mr-2 h-4 w-4" />}
          extraQueryOnSet={{ page: '1' }}
          options={excludedUserGroups.map((group) => ({
            label: group.name || 'No name',
            value: group.id,
            count: group.amount,
          }))}
        />
      )}
      <Filter
        key="user-filter"
        tag="userId"
        title={t('user-data-table.user')}
        icon={<User className="mr-2 h-4 w-4" />}
        extraQueryOnSet={{ page: '1' }}
        options={users.map((user) => ({
          label: user.full_name || 'No name',
          value: user.id,
        }))}
        multiple={false}
      />
    </>
  );
}
