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
import { MeetSidebarSettings } from './sidebar-settings';

type WorkspaceModel = Extract<
  MeetPageModel,
  { kind: 'meetings' | 'meeting' | 'workspace-plans' }
>['workspace'];

export function WorkspaceView({
  workspace,
  locale,
  children,
  canManageVersionBadge,
}: {
  workspace: WorkspaceModel;
  locale: string;
  children: ReactNode;
  canManageVersionBadge: boolean;
}) {
  const t = useTranslations();
  const { workspaceSlug, wsId, user, profile } = workspace;
  const sidebarSettingsTab = {
    content: <MeetSidebarSettings />,
    description: t('settings.preferences.sidebar_description'),
    label: t('settings.preferences.sidebar'),
  };
  const userPopover = (
    <UserNavClient
      canManageVersionBadge={canManageVersionBadge}
      user={profile}
      locale={locale}
      hideMetadata
      sidebarSettingsTab={sidebarSettingsTab}
    />
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
            <div className="flex w-full items-center gap-1">
              <div className="min-w-0 flex-1">
                <UserNavClient
                  externalSettingsHost
                  user={profile}
                  locale={locale}
                />
              </div>
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
