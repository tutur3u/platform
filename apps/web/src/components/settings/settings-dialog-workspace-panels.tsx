'use client';

import { useQuery } from '@tanstack/react-query';
import { getWorkspaceMemberSettings } from '@tuturuuu/internal-api';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { StandardWorkspaceAccessPage } from '@tuturuuu/ui/custom/workspace-access';
import { useTranslations } from 'next-intl';
import { GuestSelfJoinSetting } from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/members/_components/guest-self-join-setting';
import InviteLinksSection from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/members/_components/invite-links-section';
import WorkspaceAvatarSettings from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/settings/avatar';
import BasicInfo from '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/settings/basic-info';

interface WorkspacePanelStateProps {
  isLoadingWorkspace: boolean;
  workspace: Workspace | null;
  workspaceError: Error | null;
}

function WorkspacePanelState({
  isLoadingWorkspace,
  workspace,
  workspaceError,
}: WorkspacePanelStateProps) {
  const t = useTranslations();

  if (isLoadingWorkspace) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-muted-foreground text-sm">
            {t('settings.loading_workspace')}
          </p>
        </div>
      </div>
    );
  }

  if (workspaceError) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="font-medium text-destructive">
          {t('settings.failed_to_load_workspace')}
        </p>
        <p className="mt-1 text-muted-foreground text-sm">
          {workspaceError.message || t('settings.error_loading_workspace')}
        </p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-muted-foreground text-sm">
          {t('settings.workspace_not_found')}
        </p>
      </div>
    );
  }

  return null;
}

interface WorkspaceGeneralSettingsPanelProps extends WorkspacePanelStateProps {
  allowWorkspaceBasicsEdit: boolean;
  user: WorkspaceUser | null;
}

export function WorkspaceGeneralSettingsPanel({
  allowWorkspaceBasicsEdit,
  isLoadingWorkspace,
  user,
  workspace,
  workspaceError,
}: WorkspaceGeneralSettingsPanelProps) {
  const state = (
    <WorkspacePanelState
      isLoadingWorkspace={isLoadingWorkspace}
      workspace={workspace}
      workspaceError={workspaceError}
    />
  );

  if (isLoadingWorkspace || workspaceError || !workspace) {
    return <div className="space-y-8">{state}</div>;
  }

  return (
    <div className="space-y-8">
      <BasicInfo
        workspace={workspace}
        allowEdit={allowWorkspaceBasicsEdit}
        isPersonal={workspace.personal}
      />
      <WorkspaceAvatarSettings
        user={user}
        workspace={workspace}
        allowEdit={allowWorkspaceBasicsEdit}
      />
    </div>
  );
}

interface WorkspaceMembersSettingsPanelProps extends WorkspacePanelStateProps {
  canManageWorkspaceMembers: boolean;
  canManageWorkspaceRoles: boolean;
  currentUserEmail: string | null;
}

export function WorkspaceMembersSettingsPanel({
  canManageWorkspaceMembers,
  canManageWorkspaceRoles,
  currentUserEmail,
  isLoadingWorkspace,
  workspace,
  workspaceError,
}: WorkspaceMembersSettingsPanelProps) {
  const memberSettingsQuery = useQuery({
    enabled:
      Boolean(workspace?.id) &&
      (canManageWorkspaceMembers || canManageWorkspaceRoles),
    queryFn: () => getWorkspaceMemberSettings(workspace?.id ?? ''),
    queryKey: ['workspace-member-settings', workspace?.id],
    staleTime: 30_000,
  });
  const state = (
    <WorkspacePanelState
      isLoadingWorkspace={isLoadingWorkspace}
      workspace={workspace}
      workspaceError={workspaceError}
    />
  );

  if (isLoadingWorkspace || workspaceError || !workspace) {
    return <div className="h-full">{state}</div>;
  }

  return (
    <div className="h-full">
      <div className="space-y-6">
        <GuestSelfJoinSetting
          wsId={workspace.id}
          disabled={!canManageWorkspaceMembers}
          embedded
        />
        {canManageWorkspaceMembers ? (
          <InviteLinksSection
            wsId={workspace.id}
            canManageMembers
            disableInvite={memberSettingsQuery.data?.disableInvite ?? false}
            embedded
          />
        ) : null}
        <StandardWorkspaceAccessPage
          disableInvite={memberSettingsQuery.data?.disableInvite ?? false}
          initialContext={{
            canManageMembers: canManageWorkspaceMembers,
            canManageRoles: canManageWorkspaceRoles,
            currentUserEmail,
            workspaceId: workspace.id,
          }}
          initialTab="people"
          showHeader={false}
        />
      </div>
    </div>
  );
}
