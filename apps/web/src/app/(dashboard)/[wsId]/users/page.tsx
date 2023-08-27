'use client';

import StatisticCard from '../../../../components/cards/StatisticCard';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  params: {
    wsId: string;
  };
}

export default function WorkspaceUsersPage({ params: { wsId } }: Props) {
  const { t } = useTranslation();

  const usersLabel = t('sidebar-tabs:users');

  const usersCountApi = wsId ? `/api/workspaces/${wsId}/users/count` : null;

  const groupsCountApi = wsId
    ? `/api/workspaces/${wsId}/users/groups/count`
    : null;

  const { data: users, error: usersError } = useSWR<number>(usersCountApi);
  const { data: groups, error: groupsError } = useSWR<number>(groupsCountApi);

  const isUsersLoading = users === undefined && !usersError;
  const isGroupsLoading = groups === undefined && !groupsError;

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatisticCard
          title={usersLabel}
          color="blue"
          value={users}
          href={`/${wsId}/users/list`}
          loading={isUsersLoading}
        />

        <StatisticCard
          title={t('workspace-users-tabs:groups')}
          color="green"
          value={groups}
          href={`/${wsId}/users/groups`}
          loading={isGroupsLoading}
        />
      </div>
    </div>
  );
}
