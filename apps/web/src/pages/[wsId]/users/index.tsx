import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useSegments } from '../../../hooks/useSegments';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import StatisticCard from '../../../components/cards/StatisticCard';
import useSWR from 'swr';

export const getServerSideProps = enforceHasWorkspaces;

const WorkspaceUsersPage: PageWithLayoutProps = () => {
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
            { content: 'Users', href: `/${ws.id}/users` },
            {
              content: 'Overview',
              href: `/${ws.id}/users`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const usersCountApi = ws?.id ? `/api/workspaces/${ws.id}/users/count` : null;

  const rolesCountApi = ws?.id
    ? `/api/workspaces/${ws.id}/users/roles/count`
    : null;

  const { data: users } = useSWR<number>(usersCountApi);
  const { data: roles } = useSWR<number>(rolesCountApi);

  if (!ws) return null;

  return (
    <>
      <HeaderX label="Tổng quan – Người dùng" />
      <div className="flex min-h-full w-full flex-col pb-8">
        <div className="mt-2 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatisticCard
            title="Người dùng"
            value={users}
            href={`/${ws?.id}/users/list`}
          />

          <StatisticCard
            title="Vai trò"
            value={roles}
            href={`/${ws?.id}/users/roles`}
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
