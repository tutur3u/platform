import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import NotificationList from '@/components/notifications/notification-list';
import WorkspaceWrapper from '@/components/workspace-wrapper';

interface NotificationsPageProps {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function NotificationsPage({
  params,
}: NotificationsPageProps) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const user = await getCurrentSupabaseUser();
        if (!user) return null;

        return (
          <div className="container mx-auto max-w-4xl py-8">
            {/* Pass null for wsId to show all notifications across workspaces */}
            <NotificationList wsId={null} userId={user.id} currentWsId={wsId} />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
