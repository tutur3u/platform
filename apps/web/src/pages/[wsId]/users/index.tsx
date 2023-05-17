import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useSegments } from '../../../hooks/useSegments';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import StatisticCard from '../../../components/cards/StatisticCard';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const WorkspaceUsersPage: PageWithLayoutProps = () => {
  const { t } = useTranslation();

  const usersLabel = t('sidebar-tabs:users');
  const overviewLabel = t('workspace-users-tabs:overview');

  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: usersLabel, href: `/${ws.id}/users` },
            {
              content: overviewLabel,
              href: `/${ws.id}/users`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, usersLabel, overviewLabel, setRootSegment]);

  const usersCountApi = ws?.id ? `/api/workspaces/${ws.id}/users/count` : null;

  const groupsCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/users/groups/count`
    : null;

  const { data: users, error: usersError } = useSWR<number>(usersCountApi);
  const { data: groups, error: groupsError } = useSWR<number>(groupsCountApi);

  const isUsersLoading = users === undefined && !usersError;
  const isGroupsLoading = groups === undefined && !groupsError;

  if (!ws) return null;

  return (
    <>
      <HeaderX label={`${overviewLabel} – ${usersLabel}`} />
      <div className="flex min-h-full w-full flex-col pb-20">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatisticCard
            title={usersLabel}
            color="blue"
            value={users}
            href={`/${ws?.id}/users/list`}
            loading={isUsersLoading}
          />

          <StatisticCard
            title={t('workspace-users-tabs:groups')}
            color="green"
            value={groups}
            href={`/${ws?.id}/users/groups`}
            loading={isGroupsLoading}
          />
        </div>
      </div>
    </>
  );
};

WorkspaceUsersPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="workspace_users">{page}</NestedLayout>;
};

export default WorkspaceUsersPage;
