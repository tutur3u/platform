import type { WorkspaceProductTier } from '@tuturuuu/types/db';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { type ReactNode, Suspense } from 'react';
import { PROD_MODE } from '@/constants/env';
import {
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
} from '@/constants/sidebar';
import { isPolarWorkspaceSetupEnabled } from '@/lib/polar-config';
import {
  type DashboardLayoutWorkspace,
  getDashboardLayoutData,
} from './layout-data';
import { getWorkspaceSetupAttemptCookie } from './workspace-setup-cookie';

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
  workspace: DashboardLayoutWorkspace;
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

async function loadDashboardShellClient() {
  const { DashboardShellClient } = await import('./dashboard-shell-client');

  return DashboardShellClient;
}

export default async function Layout({ children, params }: LayoutProps) {
  await connection();

  const { wsId: id } = await params;

  const { user, workspace } = await getDashboardLayoutData(id);

  if (!user?.id) redirect('/login');
  if (!workspace) notFound();

  // Auto-assign free subscription if workspace has no active subscription. Skip
  // the preparing screen when a recent setup attempt is recorded so a degraded
  // Polar provisioning (workspace still has no resolved tier) can't trap the
  // user on a spinner — they enter with a free/null tier and it reconciles
  // later.
  if (isPolarWorkspaceSetupEnabled() && workspace.tier === null) {
    const [{ WorkspacePreparing }, cookieStore] = await Promise.all([
      import('@/components/workspace-preparing'),
      cookies(),
    ]);

    const setupAttempted = cookieStore.has(
      getWorkspaceSetupAttemptCookie(workspace.id)
    );

    if (!setupAttempted) {
      return <WorkspacePreparing wsId={workspace.id} />;
    }
  }

  const wsId = workspace.id;
  const workspaceSlug = toWorkspaceSlug(wsId, {
    personal: !!workspace.personal,
  });

  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COLLAPSED_COOKIE_NAME);
  const behaviorCookie = cookieStore.get(SIDEBAR_BEHAVIOR_COOKIE_NAME);
  const behaviorUpdatedAtCookie = cookieStore.get(
    SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME
  );

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
  const parsedBehaviorUpdatedAt = behaviorUpdatedAtCookie?.value
    ? Number(behaviorUpdatedAtCookie.value)
    : null;
  const sidebarBehaviorUpdatedAt =
    parsedBehaviorUpdatedAt &&
    Number.isSafeInteger(parsedBehaviorUpdatedAt) &&
    parsedBehaviorUpdatedAt > 0
      ? parsedBehaviorUpdatedAt
      : null;

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
    const [
      { createAdminClient, createClient },
      { loadTaskBoardGuestSharesForWorkspace, summarizeTaskBoardGuestShares },
    ] = await Promise.all([
      import('@tuturuuu/supabase/next/server'),
      import('@tuturuuu/apis/tu-do/board-access'),
    ]);
    const [supabase, sbAdmin] = await Promise.all([
      createClient(),
      createAdminClient(),
    ]);
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
      const {
        canShowWorkspaceInviteForNonMember,
        getWorkspaceNonMemberInviteEligibility,
      } = await import('@tuturuuu/utils/workspace-helper');
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
    const { createClient } = await import('@tuturuuu/supabase/next/server');
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
  const DashboardShellClient = await loadDashboardShellClient();

  return (
    <DashboardShellClient
      wsId={wsId}
      user={user}
      workspace={workspace}
      defaultCollapsed={defaultCollapsed}
      links={visibleNavigationLinks}
      sidebarBehavior={sidebarBehavior}
      sidebarBehaviorUpdatedAt={sidebarBehaviorUpdatedAt}
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
