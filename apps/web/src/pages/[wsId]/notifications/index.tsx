import { ReactElement, useEffect } from 'react';
import NestedLayout from '../../../components/layouts/NestedLayout';
import HeaderX from '../../../components/metadata/HeaderX';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import LoadingIndicator from '../../../components/common/LoadingIndicator';
import WorkspaceInviteSnippet from '../../../components/notifications/WorkspaceInviteSnippet';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import { useSegments } from '../../../hooks/useSegments';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/router';

export const getServerSideProps = enforceHasWorkspaces;

const NotificationsPage = () => {
  const {
    query: { wsId },
  } = useRouter();

  const { wsLoading, workspaceInvites } = useWorkspaces();
  const { setRootSegment } = useSegments();

  const { t } = useTranslation('notifications');

  useEffect(() => {
    setRootSegment({
      content: t('sidebar-tabs:notifications'),
      href: `/${wsId}/notifications`,
    });

    return () => setRootSegment([]);
  }, [wsId, t, setRootSegment]);

  const noNotifications = t('no-notifications');
  const desc = t('no-notifications-desc');

  return (
    <div className="min-h-full pb-20">
      <HeaderX label="Thông báo" />
      {wsLoading ? (
        <div className="flex items-center justify-center">
          <LoadingIndicator className="h-8" />
        </div>
      ) : (workspaceInvites?.length || 0) > 0 ? (
        <div className="mb-16 grid gap-4 xl:grid-cols-2">
          {workspaceInvites?.map((ws) => (
            <WorkspaceInviteSnippet key={ws.id} ws={ws} gray />
          ))}
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <CheckBadgeIcon className="h-32 w-32 text-green-500" />
          <h3 className="text-2xl font-semibold text-zinc-700 dark:text-zinc-300">
            {noNotifications}
          </h3>
          <p className="text-zinc-700 dark:text-zinc-400">{desc}</p>
        </div>
      )}
    </div>
  );
};

NotificationsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NotificationsPage;
