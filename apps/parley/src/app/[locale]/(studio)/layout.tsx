import { personalWorkspace } from '@tuturuuu/meet-core/features/call/server/room-service';
import { requireParleyUser } from '@tuturuuu/meet-core/parley/authorization';
import NavbarActions from '@tuturuuu/satellite/navbar-actions';
import NotificationPopover from '@tuturuuu/satellite/notification-popover';
import { SidebarProvider } from '@tuturuuu/satellite/sidebar-context';
import { UserNav } from '@tuturuuu/satellite/user-nav';
import {
  getSidebarBehaviorUpdatedAt,
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { type ReactNode, Suspense } from 'react';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

export default async function Layout({ children }: { children: ReactNode }) {
  await connection();
  const user = await requireParleyUser();
  const [cookieStore, wsId, links] = await Promise.all([
    cookies(),
    personalWorkspace(user.id),
    getNavigationLinks(),
  ]);
  const workspace = await getWorkspace(wsId, { useAdmin: true, user });
  if (!workspace?.joined) throw new Error('Personal workspace unavailable');
  const behavior = parseSidebarBehavior(cookieStore);
  return (
    <SidebarProvider
      initialBehavior={behavior}
      initialBehaviorUpdatedAt={getSidebarBehaviorUpdatedAt(cookieStore)}
    >
      <Structure
        wsId={wsId}
        workspace={workspace}
        links={links}
        defaultCollapsed={getSidebarCollapsedState(cookieStore, behavior)}
        actions={
          <Suspense fallback={null}>
            <NavbarActions userId={user.id} />
          </Suspense>
        }
        notificationPopover={<NotificationPopover userId={user.id} />}
        userPopover={
          <Suspense fallback={null}>
            <UserNav hideMetadata />
          </Suspense>
        }
      >
        <div className="mx-auto w-full max-w-7xl space-y-8 p-4 md:p-8">
          {children}
        </div>
      </Structure>
    </SidebarProvider>
  );
}
