import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { createClient } from '@tuturuuu/supabase/next/server';
import { WorkspacePresenceProvider } from '@tuturuuu/ui/tu-do/providers/workspace-presence-provider';
import { TaskDialogWrapper } from '@tuturuuu/ui/tu-do/shared/task-dialog-wrapper';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import { WorkspacePreparing } from '@/components/workspace-preparing';
import {
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
} from '@/constants/common';
import { SidebarProvider } from '@/context/sidebar-context';
import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import InvitationCard from './invitation-card';
import { WorkspaceNavigationLinks } from './navigation';
import { PersonalWorkspaceCollaborationBanner } from './personal-workspace-collaboration-banner';
import PersonalWorkspacePrompt from './personal-workspace-prompt';
import { Structure } from './structure';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const t = await getTranslations();
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id, { useAdmin: true });
  if (!workspace) notFound();

  const isPolarConfigured =
    !!process.env.POLAR_WEBHOOK_SECRET && !!process.env.POLAR_ACCESS_TOKEN;

  // Auto-assign free subscription if workspace has no active subscription
  if (isPolarConfigured && workspace.tier === null) {
    return <WorkspacePreparing wsId={workspace.id} />;
  }

  const wsId = workspace.id;
  const workspaceSlug = toWorkspaceSlug(wsId, {
    personal: !!workspace.personal,
  });

  const user = await getCurrentUser();

  if (!user?.id) redirect('/login');

  const supabase = await createClient();

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
  if (!workspace?.joined)
    return (
      <div className="flex h-screen w-screen items-center justify-center p-2 md:p-4">
        <InvitationCard workspace={workspace} />
      </div>
    );

  // Personal workspace prompt data
  const { data: existingPersonal } = await supabase
    .from('workspaces')
    .select('id')
    .eq('personal', true)
    .eq('creator_id', user.id)
    .maybeSingle();

  let eligibleWorkspaces: { id: string; name: string | null }[] | undefined;

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

  const SHOW_PERSONAL_WORKSPACE_PROMPT = !existingPersonal;

  if (SHOW_PERSONAL_WORKSPACE_PROMPT && eligibleWorkspaces?.length === 0)
    return (
      <PersonalWorkspacePrompt
        eligibleWorkspaces={eligibleWorkspaces || []}
        title={t('common.personal_account')}
        description={t('common.set_up_personal_workspace')}
        nameRule={t('common.personal_workspace_naming_rule')}
        createLabel={t('common.create_workspace')}
        markLabel={t('common.mark_as_personal')}
        selectPlaceholder={t('common.select_workspace')}
      />
    );

  return (
    <SidebarProvider initialBehavior={sidebarBehavior}>
      {SHOW_PERSONAL_WORKSPACE_PROMPT && (
        <div className="px-2 pt-2 md:px-4 md:pt-3">
          <PersonalWorkspacePrompt
            eligibleWorkspaces={eligibleWorkspaces || []}
            title={t('common.personal_account')}
            description={t('common.set_up_personal_workspace')}
            nameRule={t('common.personal_workspace_naming_rule')}
            createLabel={t('common.create_workspace')}
            markLabel={t('common.mark_as_personal')}
            selectPlaceholder={t('common.select_workspace')}
          />
        </div>
      )}
      <Structure
        wsId={wsId}
        user={user}
        workspace={workspace}
        defaultCollapsed={defaultCollapsed}
        links={
          await WorkspaceNavigationLinks({
            wsId,
            personalOrWsId: workspaceSlug,
            isPersonal: !!workspace.personal,
            isTuturuuuUser: !!user.email?.endsWith('@tuturuuu.com'),
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
            <UserNav hideMetadata workspace={workspace} />
          </Suspense>
        }
      >
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
              {workspace.personal && <PersonalWorkspaceCollaborationBanner />}
              {children}
            </TaskDialogWrapper>
          </WorkspacePresenceProvider>
        </RealtimeLogProvider>
      </Structure>
    </SidebarProvider>
  );
}
