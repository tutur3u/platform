import { ReactElement, useEffect } from 'react';
import NestedLayout from '../../../components/layouts/NestedLayout';
import HeaderX from '../../../components/metadata/HeaderX';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import LoadingIndicator from '../../../components/common/LoadingIndicator';
import WorkspaceInviteSnippet from '../../../components/notifications/WorkspaceInviteSnippet';
import { Workspace } from '../../../types/primitives/Workspace';
import { mutate } from 'swr';
import { showNotification } from '@mantine/notifications';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import { useSegments } from '../../../hooks/useSegments';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';

export const getServerSideProps = enforceHasWorkspaces;

const NotificationsPage = () => {
  const { wsLoading, workspaceInvites } = useWorkspaces();
  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment({
      content: 'Thông báo',
      href: `/notifications`,
    });

    return () => setRootSegment([]);
  }, [setRootSegment]);

  const acceptInvite = async (ws: Workspace) => {
    const response = await fetch(`/api/workspaces/${ws.id}/invites`, {
      method: 'POST',
    });

    if (response.ok) {
      mutate('/api/workspaces');
      mutate('/api/workspaces/invites');
      showNotification({
        title: `Đã chấp nhận lời mời vào ${ws.name}`,
        message: 'Bạn có thể truy cập vào tổ chức này ngay bây giờ',
      });
    } else {
      showNotification({
        title: `Không thể chấp nhận lời mời vào ${ws.name}`,
        message: 'Vui lòng thử lại sau',
      });
    }
  };

  const declineInvite = async (ws: Workspace) => {
    const response = await fetch(`/api/workspaces/${ws.id}/invites`, {
      method: 'DELETE',
    });

    if (response.ok) {
      mutate('/api/workspaces/invites');
      showNotification({
        title: `Đã từ chối lời mời vào ${ws.name}`,
        message: 'Lời mời này sẽ không hiển thị nữa',
      });
    } else {
      showNotification({
        title: `Không thể từ chối lời mời vào ${ws.name}`,
        message: 'Vui lòng thử lại sau',
      });
    }
  };

  return (
    <div className="h-screen">
      <HeaderX label="Thông báo" />
      {wsLoading ? (
        <div className="flex items-center justify-center">
          <LoadingIndicator className="h-8" />
        </div>
      ) : (workspaceInvites?.length || 0) > 0 ? (
        <div className="mb-16 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspaceInvites?.map((ws) => (
            <WorkspaceInviteSnippet
              key={ws.id}
              ws={ws}
              onAccept={acceptInvite}
              onDecline={declineInvite}
              gray
            />
          ))}
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <CheckBadgeIcon className="h-32 w-32 text-green-500" />
          <h3 className="text-2xl font-semibold text-zinc-300">
            Không có thông báo nào
          </h3>
          <p className="text-zinc-400">
            Bạn sẽ nhận được thông báo khi có lời mời vào tổ chức mới
          </p>
        </div>
      )}
    </div>
  );
};

NotificationsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NotificationsPage;
