import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import NotificationPopover from '@tuturuuu/satellite/notification-popover';
import {
  getPendingWorkspaceInvitation,
  SatelliteWorkspaceInvitationCard,
} from '@tuturuuu/satellite/workspace-invitation';
import {
  getSidebarBehaviorUpdatedAt,
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import { SidebarProvider } from '@/context/sidebar-context';
import { getAiStudioWorkspaceAccess } from '@/lib/access';
import NavbarActions from '../navbar-actions';
import { UserNav } from '../user-nav';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ wsId: string }>;
}

export default function Layout(props: LayoutProps) {
  return (
    <Suspense fallback={<WorkspaceLayoutSkeleton />}>
      <WorkspaceLayoutContent {...props} />
    </Suspense>
  );
}

async function WorkspaceLayoutContent({ children, params }: LayoutProps) {
  await connection();

  const { wsId: workspaceAlias } = await params;
  const requestHeaders = await headers();
  const user = await getSatelliteAppSessionUser('ai');
  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(workspaceAlias, {
    useAdmin: true,
    user,
  });

  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(
      workspaceAlias,
      requestHeaders
    );

    if (invitation) {
      return (
        <SatelliteWorkspaceInvitationCard
          afterDeclineHref="/dashboard"
          invitation={invitation}
          workspaceHref={`/${invitation.workspace.id}`}
        />
      );
    }
  }

  if (!workspace?.joined) redirect('/dashboard');

  const access = await getAiStudioWorkspaceAccess({ user, workspace });
  if (!access) redirect('/dashboard');

  const personalOrWsId = toWorkspaceSlug(workspace.id, {
    personal: Boolean(workspace.personal),
  });
  const cookieStore = await cookies();
  const sidebarBehavior = parseSidebarBehavior(cookieStore);
  const sidebarBehaviorUpdatedAt = getSidebarBehaviorUpdatedAt(cookieStore);
  const defaultCollapsed = getSidebarCollapsedState(
    cookieStore,
    sidebarBehavior
  );
  const canUseAiStudio = access.permissions.containsPermission('use_ai_studio');

  return (
    <SidebarProvider
      initialBehavior={sidebarBehavior}
      initialBehaviorUpdatedAt={sidebarBehaviorUpdatedAt}
    >
      <Structure
        actions={
          <Suspense
            key={user.id}
            fallback={
              <div className="h-10 w-22 animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <NavbarActions userId={user.id} />
          </Suspense>
        }
        defaultCollapsed={defaultCollapsed}
        links={
          await getNavigationLinks({
            canManageAiKeys:
              access.permissions.containsPermission('manage_ai_keys'),
            personalOrWsId,
          })
        }
        notificationPopover={<NotificationPopover userId={user.id} />}
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
        wsId={workspace.id}
      >
        {canUseAiStudio ? children : <AiStudioPermissionRequired />}
      </Structure>
    </SidebarProvider>
  );
}

async function AiStudioPermissionRequired() {
  const t = await getTranslations('ai-studio');
  return (
    <div className="grid min-h-[calc(100dvh-5rem)] place-items-center p-4 sm:p-8">
      <div className="w-full max-w-xl rounded-3xl border bg-card/80 p-6 text-center shadow-xl backdrop-blur sm:p-10">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <span className="font-semibold text-xl">AI</span>
        </div>
        <h1 className="text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
          {t('access-required')}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-balance text-muted-foreground">
          {t('access-required-description')}
        </p>
      </div>
    </div>
  );
}

function WorkspaceLayoutSkeleton() {
  return (
    <div className="grid min-h-screen grid-cols-[4rem_1fr] md:grid-cols-[18rem_1fr]">
      <div className="border-r bg-foreground/[0.02] p-3" aria-hidden="true">
        <div className="h-10 animate-pulse rounded-lg bg-foreground/10" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 10 }, (_, index) => (
            <div
              className="h-9 animate-pulse rounded-lg bg-foreground/5"
              key={index}
            />
          ))}
        </div>
      </div>
      <div className="space-y-4 p-4" aria-busy="true">
        <div className="h-14 animate-pulse rounded-xl bg-foreground/5" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              className="h-36 animate-pulse rounded-2xl bg-foreground/5"
              key={index}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
