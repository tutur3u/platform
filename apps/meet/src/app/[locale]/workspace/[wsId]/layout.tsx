import NavbarActions from '@tuturuuu/satellite/navbar-actions';
import { SidebarProvider } from '@tuturuuu/satellite/sidebar-context';
import { UserNav } from '@tuturuuu/satellite/user-nav';
import {
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { cookies } from 'next/headers';
import { type ReactNode, Suspense } from 'react';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';
import { getMeetWorkspaceContext } from './workspace-context';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Layout({ children, params }: LayoutProps) {
  const [{ wsId: id }, cookieStore] = await Promise.all([params, cookies()]);
  const { user, workspace, workspaceSlug, wsId } =
    await getMeetWorkspaceContext(id);
  const sidebarBehavior = parseSidebarBehavior(cookieStore);
  const defaultCollapsed = getSidebarCollapsedState(
    cookieStore,
    sidebarBehavior
  );

  return (
    <SidebarProvider initialBehavior={sidebarBehavior}>
      <Structure
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
        defaultCollapsed={defaultCollapsed}
        links={await getNavigationLinks({ workspaceSlug })}
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
        workspace={workspace}
        wsId={wsId}
      >
        <RealtimeLogProvider wsId={wsId}>
          <div data-workspace-slug={workspaceSlug}>{children}</div>
        </RealtimeLogProvider>
      </Structure>
    </SidebarProvider>
  );
}
