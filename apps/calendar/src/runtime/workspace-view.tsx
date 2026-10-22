import { CalendarDays, CheckSquare } from '@tuturuuu/icons';
import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { WorkspacePresenceProvider } from '@tuturuuu/tasks-ui/tu-do/providers/workspace-presence-provider';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Structure } from '../app/[locale]/(dashboard)/[wsId]/structure';
import UserNavClient from '../app/[locale]/user-nav-client';
import { CalendarNavigationProvider } from '../components/calendar-navigation-provider';
import { SettingsDialogHost } from '../components/settings/settings-dialog-host';
import { SidebarProvider } from '../context/sidebar-context';
import NotificationPopover from './notification-popover';
import type { CalendarWorkspaceModel } from './workspace-model.server';

export function WorkspaceView({
  model,
  locale,
  children,
}: {
  model: CalendarWorkspaceModel;
  locale: string;
  children: ReactNode;
}) {
  const t = useTranslations('sidebar_tabs');
  const { workspace, user } = model;
  const slug = toWorkspaceSlug(workspace.id, {
    personal: !!workspace.personal,
  });
  const userPopover = (
    <UserNavClient user={model.profile} locale={locale} hideMetadata />
  );
  const notifications = <NotificationPopover userId={user.id} />;
  return (
    <WorkspaceVisibilityProvider actorId={user.id}>
      <SidebarProvider
        initialBehavior={model.behavior}
        initialBehaviorUpdatedAt={model.behaviorUpdatedAt}
      >
        <CalendarNavigationProvider>
          <CalendarSyncProvider
            initialCalendarConnections={model.calendarConnections}
            wsId={workspace.id}
          >
            <Structure
              wsId={workspace.id}
              workspace={workspace}
              defaultCollapsed={model.defaultCollapsed}
              links={[
                {
                  title: t('calendar'),
                  href: `/${slug}`,
                  matchExact: true,
                  icon: <CalendarDays className="h-4 w-4" />,
                },
                {
                  title: t('tasks'),
                  href: `/${slug}/tasks`,
                  aliases: [`/${slug}/tasks/*`],
                  icon: <CheckSquare className="h-4 w-4" />,
                },
              ]}
              actions={
                <div className="flex w-full items-center gap-1">
                  <div className="flex-1">{userPopover}</div>
                  {notifications}
                </div>
              }
              notificationPopover={notifications}
              userPopover={userPopover}
            >
              <RealtimeLogProvider wsId={workspace.id}>
                <WorkspacePresenceProvider
                  wsId={workspace.id}
                  tier={workspace.tier ?? null}
                  enabled={!workspace.personal}
                >
                  <SettingsDialogHost
                    user={model.profile}
                    wsId={workspace.id}
                  />
                  {children}
                </WorkspacePresenceProvider>
              </RealtimeLogProvider>
            </Structure>
          </CalendarSyncProvider>
        </CalendarNavigationProvider>
      </SidebarProvider>
    </WorkspaceVisibilityProvider>
  );
}
