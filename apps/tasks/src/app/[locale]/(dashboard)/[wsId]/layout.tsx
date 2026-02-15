import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { WorkspacePresenceProvider } from '@tuturuuu/ui/tu-do/providers/workspace-presence-provider';
import { TaskDialogWrapper } from '@tuturuuu/ui/tu-do/shared/task-dialog-wrapper';
import { TasksRouteProvider } from '@tuturuuu/ui/tu-do/tasks-route-context';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import {
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
} from '@/constants/common';
import { SidebarProvider } from '@/context/sidebar-context';
import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(id, { useAdmin: true });

  if (!workspace) redirect('/onboarding');
  if (!workspace?.joined) redirect('/');

  const wsId = workspace.id;
  const workspaceSlug = toWorkspaceSlug(wsId, {
    personal: !!workspace.personal,
  });

  const collapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE_NAME);
  const behaviorCookie = (await cookies()).get(SIDEBAR_BEHAVIOR_COOKIE_NAME);

  const rawBehavior = behaviorCookie?.value;
  const isValidBehavior = (
    value: string | undefined
  ): value is 'expanded' | 'collapsed' | 'hover' => {
    if (!value) return false;
    return ['expanded', 'collapsed', 'hover'].includes(value);
  };

  const sidebarBehavior: 'expanded' | 'collapsed' | 'hover' = isValidBehavior(
    rawBehavior
  )
    ? rawBehavior
    : 'expanded';

  let defaultCollapsed: boolean;
  if (sidebarBehavior === 'collapsed') {
    defaultCollapsed = true;
  } else if (sidebarBehavior === 'hover') {
    defaultCollapsed = true;
  } else {
    defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : false;
  }

  return (
    <SidebarProvider initialBehavior={sidebarBehavior}>
      <Structure
        wsId={wsId}
        defaultCollapsed={defaultCollapsed}
        links={
          await getNavigationLinks({
            personalOrWsId: workspaceSlug,
          })
        }
        actions={
          <Suspense
            key={user.id}
            fallback={
              <div className="h-10 w-22 animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <NavbarActions />
          </Suspense>
        }
        userPopover={
          <Suspense
            key={user.id}
            fallback={
              <div className="h-10 w-10 animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <UserNav hideMetadata />
          </Suspense>
        }
      >
        <TasksRouteProvider prefix="">
          <RealtimeLogProvider wsId={wsId}>
            <WorkspacePresenceProvider
              wsId={wsId}
              tier={workspace.tier ?? null}
              enabled={!workspace.personal}
            >
              <TaskDialogWrapper
                isPersonalWorkspace={!!workspace.personal}
                wsId={wsId}
              >
                {children}
              </TaskDialogWrapper>
            </WorkspacePresenceProvider>
          </RealtimeLogProvider>
        </TasksRouteProvider>
      </Structure>
    </SidebarProvider>
  );
}
