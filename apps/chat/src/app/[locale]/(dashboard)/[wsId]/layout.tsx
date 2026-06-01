import NavbarActions from '@tuturuuu/satellite/navbar-actions';
import { SidebarProvider } from '@tuturuuu/satellite/sidebar-context';
import { UserNav } from '@tuturuuu/satellite/user-nav';
import {
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { requireChatUser } from '@/lib/access';
import { getDefaultChatConversationScope } from './chat-default-scope';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Layout({ children, params }: LayoutProps) {
  const [{ wsId: id }, user, cookieStore] = await Promise.all([
    params,
    requireChatUser(),
    cookies(),
  ]);
  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (!workspace) redirect('/');
  if (!workspace.joined) redirect('/');

  const wsId = workspace.id;
  const defaultConversationScope = getDefaultChatConversationScope(workspace);
  const workspaceSlug = toWorkspaceSlug(wsId, {
    personal: !!workspace.personal,
  });
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
        currentUserId={user.id}
        defaultConversationScope={defaultConversationScope}
        defaultCollapsed={defaultCollapsed}
        links={await getNavigationLinks({ personalOrWsId: workspaceSlug })}
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
