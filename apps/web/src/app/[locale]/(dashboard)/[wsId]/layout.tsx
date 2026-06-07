import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { WorkspaceProductTier } from '@tuturuuu/types/db';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import {
  canShowWorkspaceInviteForNonMember,
  getWorkspace,
  getWorkspaceNonMemberInviteEligibility,
} from '@tuturuuu/utils/workspace-helper';
import dynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import {
  PROD_MODE,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
} from '@/constants/common';

const DashboardShellClient = dynamic(() =>
  import('./dashboard-shell-client').then(
    (module) => module.DashboardShellClient
  )
);

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: ReactNode;
}

async function createPersonalWorkspacePrompt(
  eligibleWorkspaces: { id: string; name: string | null }[]
) {
  const [{ getTranslations }, { default: PersonalWorkspacePrompt }] =
    await Promise.all([
      import('next-intl/server'),
      import('./personal-workspace-prompt'),
    ]);
  const t = await getTranslations();

  return (
    <PersonalWorkspacePrompt
      eligibleWorkspaces={eligibleWorkspaces}
      title={t('common.personal_account')}
      description={t('common.set_up_personal_workspace')}
      nameRule={t('common.personal_workspace_naming_rule')}
      createLabel={t('common.create_workspace')}
      markLabel={t('common.mark_as_personal')}
      selectPlaceholder={t('common.select_workspace')}
    />
  );
}

async function createNavigationLinks({
  isPersonal,
  personalOrWsId,
  user,
  workspaceTier,
  wsId,
}: {
  isPersonal: boolean;
  personalOrWsId: string;
  user: WorkspaceUser;
  workspaceTier: WorkspaceProductTier | null;
  wsId: string;
}) {
  const [{ WorkspaceNavigationLinks }, { filterDashboardNavigationLinks }] =
    await Promise.all([
      import('./navigation'),
      import('./navigation-visibility'),
    ]);

  const navigationLinks = await WorkspaceNavigationLinks({
    wsId,
    personalOrWsId,
    isPersonal,
    isTuturuuuUser: !!user.email?.endsWith('@tuturuuu.com'),
    user: {
      email: user.email ?? undefined,
      id: user.id,
    },
  });

  return filterDashboardNavigationLinks(navigationLinks, {
    currentWsId: wsId,
    prodMode: PROD_MODE,
    userEmail: user.email,
    workspaceTier,
  });
}

async function NavbarActionsSlot({ user }: { user: WorkspaceUser }) {
  const { default: NavbarActions } = await import('../../navbar-actions');

  return (
    <NavbarActions
      renderCommandLauncher={false}
      renderSettingsDialog={false}
      user={user}
    />
  );
}

async function UserPopoverSlot({
  user,
  workspace,
}: {
  user: WorkspaceUser;
  workspace: NonNullable<Awaited<ReturnType<typeof getWorkspace>>>;
}) {
  const { UserNav } = await import('../../user-nav');

  return (
    <UserNav
      hideMetadata
      workspace={workspace}
      user={user}
      renderSettingsDialog={false}
    />
  );
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId: id } = await params;

  const [user, workspace] = await Promise.all([
    getCurrentUser(),
    getWorkspace(id, { useAdmin: true }),
  ]);

  if (!user?.id) redirect('/login');
  if (!workspace) notFound();

  const isPolarConfigured =
    !!process.env.POLAR_WEBHOOK_SECRET && !!process.env.POLAR_ACCESS_TOKEN;

  // Auto-assign free subscription if workspace has no active subscription
  if (isPolarConfigured && workspace.tier === null) {
    const { WorkspacePreparing } = await import(
      '@/components/workspace-preparing'
    );

    return <WorkspacePreparing wsId={workspace.id} />;
  }

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

  if (!workspace) redirect('/onboarding');

  let isGuestWorkspace = false;

  if (!workspace.joined) {
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();
    const {
      loadTaskBoardGuestSharesForWorkspace,
      summarizeTaskBoardGuestShares,
    } = await import('@tuturuuu/apis/tu-do/board-access');
    const guestShares = await loadTaskBoardGuestSharesForWorkspace({
      sbAdmin,
      user: {
        email: user.email ?? undefined,
        id: user.id,
      },
      workspaceId: workspace.id,
    });
    const guestSummary = summarizeTaskBoardGuestShares(guestShares);

    if (guestSummary.boardCount > 0) {
      isGuestWorkspace = true;
    } else {
      const inviteEligibility = await getWorkspaceNonMemberInviteEligibility(
        sbAdmin,
        {
          workspaceId: workspace.id,
          userId: user.id,
          authEmail: user.email?.trim().toLowerCase() ?? null,
          rpcSupabase: supabase,
        }
      );

      if (!canShowWorkspaceInviteForNonMember(inviteEligibility)) {
        redirect('/onboarding');
      }

      const { allowGuestSelfJoin } = inviteEligibility;

      const [
        { resolveWorkspaceBrandingUrlsForNext },
        { default: InvitationCard },
      ] = await Promise.all([
        import('@/lib/workspace-branding-image-url'),
        import('./invitation-card'),
      ]);
      const branding = await resolveWorkspaceBrandingUrlsForNext(sbAdmin, {
        logo_url: workspace.logo_url,
        avatar_url: workspace.avatar_url,
      });

      return (
        <InvitationCard
          workspace={{
            ...workspace,
            logo_url: branding.logo_url,
            avatar_url: branding.avatar_url,
          }}
          allowGuestSelfJoin={allowGuestSelfJoin}
        />
      );
    }
  }

  let eligibleWorkspaces: { id: string; name: string | null }[] | undefined;
  let showPersonalWorkspacePrompt = false;
  let personalWorkspacePrompt: ReactNode = null;

  if (!workspace.personal && !isGuestWorkspace) {
    const supabase = await createClient();
    const { data: existingPersonal } = await supabase
      .from('workspaces')
      .select('id')
      .eq('personal', true)
      .eq('creator_id', user.id)
      .maybeSingle();

    if (!existingPersonal) {
      const { data: candidates } = await supabase
        .from('workspaces')
        .select('id, name, creator_id, workspace_members(count)')
        .eq('creator_id', user.id);
      eligibleWorkspaces = (candidates || []).filter((ws) => {
        const memberCount = ws.workspace_members?.[0]?.count ?? 0;
        return memberCount === 1;
      });
    }

    showPersonalWorkspacePrompt = !existingPersonal;

    if (showPersonalWorkspacePrompt) {
      personalWorkspacePrompt = await createPersonalWorkspacePrompt(
        eligibleWorkspaces || []
      );
    }
  }

  if (showPersonalWorkspacePrompt && eligibleWorkspaces?.length === 0) {
    return personalWorkspacePrompt;
  }

  const visibleNavigationLinks = await createNavigationLinks({
    wsId,
    personalOrWsId: workspaceSlug,
    isPersonal: !!workspace.personal,
    user,
    workspaceTier: workspace.tier ?? null,
  });

  return (
    <DashboardShellClient
      wsId={wsId}
      user={user}
      workspace={workspace}
      defaultCollapsed={defaultCollapsed}
      links={visibleNavigationLinks}
      sidebarBehavior={sidebarBehavior}
      isGuestWorkspace={isGuestWorkspace}
      tier={workspace.tier ?? null}
      enablePresence={!workspace.personal && !isGuestWorkspace}
      isPersonalWorkspace={!!workspace.personal}
      showPersonalWorkspaceCollaborationBanner={!!workspace.personal}
      personalWorkspacePrompt={personalWorkspacePrompt}
      actions={
        <Suspense
          key={user.id}
          fallback={
            <div className="h-10 w-22 animate-pulse rounded-lg bg-foreground/5" />
          }
        >
          <NavbarActionsSlot user={user} />
        </Suspense>
      }
      userPopover={
        <Suspense
          key={user.id}
          fallback={
            <div className="h-10 w-10 animate-pulse rounded-lg bg-foreground/5" />
          }
        >
          <UserPopoverSlot user={user} workspace={workspace} />
        </Suspense>
      }
    >
      {children}
    </DashboardShellClient>
  );
}
