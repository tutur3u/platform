import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { SIDEBAR_BEHAVIOR_COOKIE_NAME } from '@/constants/common';
import { SidebarProvider } from '@/context/sidebar-context';
import { requireMindUser } from '@/lib/access';
import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ wsId: string }>;
};

export default async function MindWorkspaceLayout({
  children,
  params,
}: LayoutProps) {
  const [{ wsId }, user, cookieStore] = await Promise.all([
    params,
    requireMindUser(),
    cookies(),
  ]);
  const workspace = await getWorkspace(wsId, { useAdmin: true, user });

  if (!workspace) redirect('/dashboard');
  if (!workspace.joined) redirect('/dashboard');

  const workspaceSlug = toWorkspaceSlug(workspace.id, {
    personal: !!workspace.personal,
  });
  const rawBehavior = cookieStore.get(SIDEBAR_BEHAVIOR_COOKIE_NAME)?.value;
  const sidebarBehavior =
    rawBehavior === 'expanded' || rawBehavior === 'hover'
      ? rawBehavior
      : 'collapsed';

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
        defaultCollapsed={sidebarBehavior !== 'expanded'}
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
        workspaceSlug={workspaceSlug}
        wsId={workspace.id}
      >
        {children}
      </Structure>
    </SidebarProvider>
  );
}
