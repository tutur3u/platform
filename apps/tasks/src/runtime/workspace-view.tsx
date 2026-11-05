import NotificationPopoverView from '@tuturuuu/satellite/notification-popover-view';
import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { WorkspacePresenceProvider } from '@tuturuuu/tasks-ui/tu-do/providers/workspace-presence-provider';
import { TaskDialogWrapper } from '@tuturuuu/tasks-ui/tu-do/shared/task-dialog-wrapper';
import { TasksRouteProvider } from '@tuturuuu/tasks-ui/tu-do/tasks-route-context';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useMemo } from 'react';
import { buildNavigationLinks } from '../app/[locale]/(dashboard)/[wsId]/navigation';
import { Structure } from '../app/[locale]/(dashboard)/[wsId]/structure';
import UserNavClient from '../app/[locale]/user-nav-client';
import { TasksCommandLauncher } from '../components/command-center/tasks-command-launcher';
import { SettingsDialogHost } from '../components/settings/settings-dialog-host';
import { TTR_URL } from '../constants/common';
import { SidebarProvider } from '../context/sidebar-context';
import type { TasksWorkspaceModel } from './workspace-model.server';

/** The `[wsId]` layout shell over a serializable workspace model. */
export function WorkspaceView({
  model,
  children,
}: {
  model: TasksWorkspaceModel;
  children: ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { workspace, user, slug } = model;
  const { canManageCycles } = model;
  const links = useMemo(
    () => buildNavigationLinks(t, slug, { canManageCycles }),
    [t, slug, canManageCycles]
  );
  const userPopover = (
    <UserNavClient user={model.profile} locale={locale} hideMetadata />
  );
  const notifications = (
    <NotificationPopoverView userId={user.id} webAppUrl={TTR_URL} />
  );
  return (
    <WorkspaceVisibilityProvider actorId={user.id}>
      <SidebarProvider
        initialBehavior={model.behavior}
        initialBehaviorUpdatedAt={model.behaviorUpdatedAt}
      >
        <Structure
          wsId={workspace.id}
          workspace={workspace}
          defaultCollapsed={model.defaultCollapsed}
          links={links}
          actions={
            <div className="flex w-full items-center gap-1">
              <div className="flex-1">{userPopover}</div>
              {notifications}
            </div>
          }
          notificationPopover={notifications}
          userPopover={userPopover}
        >
          <TasksRouteProvider prefix="">
            <RealtimeLogProvider wsId={workspace.id}>
              <WorkspacePresenceProvider
                wsId={workspace.id}
                tier={workspace.tier ?? null}
                enabled={!workspace.personal}
              >
                <TaskDialogWrapper
                  isPersonalWorkspace={!!workspace.personal}
                  routePrefix=""
                  wsId={workspace.id}
                >
                  <SettingsDialogHost
                    user={user}
                    workspace={workspace}
                    wsId={workspace.id}
                  />
                  <TasksCommandLauncher
                    isPersonalWorkspace={!!workspace.personal}
                    navLinks={links}
                    workspaceSlug={slug}
                    wsId={workspace.id}
                  />
                  {children}
                </TaskDialogWrapper>
              </WorkspacePresenceProvider>
            </RealtimeLogProvider>
          </TasksRouteProvider>
        </Structure>
      </SidebarProvider>
    </WorkspaceVisibilityProvider>
  );
}
