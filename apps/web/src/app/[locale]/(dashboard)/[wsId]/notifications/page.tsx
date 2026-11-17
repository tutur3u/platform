import { notificationCodeTextFrom } from '@tuturuuu/ui/custom/notification-code-text';
import NotificationPageClient from '@tuturuuu/ui/custom/notification-page-client';
import { notificationPageLabelsFrom } from '@tuturuuu/ui/custom/notification-page-labels';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { getTranslations } from 'next-intl/server';
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
  const { wsId: routeParam } = await params;

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, isPersonal }) => {
        const user = await getCurrentSupabaseUser();
        if (!user) return null;
        const t = await getTranslations();

        return (
          <NotificationPageClient
            userId={user.id}
            // The personal inbox is account-wide; a workspace route can
            // narrow the list to that workspace.
            routeWsId={isPersonal ? undefined : wsId}
            taskWsId={routeParam}
            labels={notificationPageLabelsFrom(t)}
            codeText={notificationCodeTextFrom(t)}
            settingsHref={`/${routeParam}/settings/notifications`}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
