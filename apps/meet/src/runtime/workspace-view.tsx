import { Calendar, Video } from '@tuturuuu/icons';
import { SidebarProvider } from '@tuturuuu/satellite/sidebar-context';
import UserNavClient from '@tuturuuu/satellite/user-nav-client';
import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Structure } from '../app/[locale]/[wsId]/structure';
import NotificationPopover from './notification-popover';
import type { MeetPageModel } from './page-model.server';

type WorkspaceModel = Extract<
  MeetPageModel,
  { kind: 'meetings' | 'meeting' | 'workspace-plans' }
>['workspace'];

export function WorkspaceView({
  workspace,
  locale,
  children,
}: {
  workspace: WorkspaceModel;
  locale: string;
  children: ReactNode;
}) {
  const t = useTranslations();
  const { workspaceSlug, wsId, user, profile } = workspace;
  const userPopover = (
    <UserNavClient user={profile} locale={locale} hideMetadata />
  );
  const notificationPopover = <NotificationPopover userId={user.id} />;
  return (
    <WorkspaceVisibilityProvider actorId={user.id}>
      <SidebarProvider
        initialBehavior={workspace.behavior}
        initialBehaviorUpdatedAt={workspace.behaviorUpdatedAt}
      >
        <Structure
          actions={
            <div className="flex items-center gap-1">
              {userPopover}
              {notificationPopover}
            </div>
          }
          defaultCollapsed={workspace.defaultCollapsed}
          links={[
            {
              title: t('sidebar_tabs.plans'),
              href: `/${workspaceSlug}/plans`,
              icon: <Calendar className="h-4 w-4" />,
            },
            {
              title: t('sidebar_tabs.meetings'),
              href: `/${workspaceSlug}/meetings`,
              icon: <Video className="h-4 w-4" />,
            },
          ]}
          notificationPopover={notificationPopover}
          userPopover={userPopover}
          workspace={workspace.workspace}
          wsId={wsId}
        >
          <RealtimeLogProvider wsId={wsId}>
            <div data-workspace-slug={workspaceSlug}>{children}</div>
          </RealtimeLogProvider>
        </Structure>
      </SidebarProvider>
    </WorkspaceVisibilityProvider>
  );
}
