import { ReactElement, useEffect } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useSegments } from '../../../hooks/useSegments';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import { getUsersLabel } from '../../../utils/ws-helper';

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
            { content: getUsersLabel(ws), href: `/${ws.id}/users` },
            {
              content: 'Overview',
              href: `/${ws.id}/users`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  if (!ws) return null;

  return (
    <>
      <HeaderX label="Bệnh nhân – Khám bệnh" />
      <div className="flex min-h-full w-full flex-col pb-8"></div>
    </>
  );
};

WorkspaceUsersPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="workspace_users">{page}</NestedLayout>;
};

export default WorkspaceUsersPage;
