'use client';

import { useQuery } from '@tanstack/react-query';
import { getWorkspaceMemberSettings } from '@tuturuuu/internal-api';
import type { Workspace } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  SettingsSection,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { StandardWorkspaceAccessPage } from '@tuturuuu/ui/custom/workspace-access';
import { WorkspaceDeletionSettings } from '@tuturuuu/ui/custom/workspace-deletion-settings';
import { HiddenWorkspacesSettings } from '@tuturuuu/ui/custom/workspace-select';
import {
  LoadingRegion,
  SkeletonList,
  SkeletonText,
} from '@tuturuuu/ui/skeleton';
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
      <LoadingRegion
        className="space-y-4 py-4"
        srLabel={t('settings.loading_workspace')}
      >
        <SkeletonText lines={2} />
        <SkeletonList rows={3} withAvatar={false} />
      </LoadingRegion>
    );
  }

  if (workspaceError) {
    return (
      <SettingsSection>
        <SettingsSectionMessage tone="error">
          <div className="space-y-1">
            <p className="font-medium">
              {t('settings.failed_to_load_workspace')}
            </p>
            <p className="text-muted-foreground">
              {workspaceError.message || t('settings.error_loading_workspace')}
            </p>
          </div>
        </SettingsSectionMessage>
      </SettingsSection>
    );
  }

  if (!workspace) {
    return (
      <SettingsSection>
        <SettingsSectionMessage>
          {t('settings.workspace_not_found')}
        </SettingsSectionMessage>
      </SettingsSection>
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
    return (
      <div className="space-y-8">
        {state}
        <HiddenWorkspacesSettings />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <BasicInfo
        workspace={workspace}
        allowEdit={allowWorkspaceBasicsEdit}
        isPersonal={workspace.personal}
      >
        <WorkspaceAvatarSettings
          user={user}
          workspace={workspace}
          allowEdit={allowWorkspaceBasicsEdit}
        />
      </BasicInfo>
      <HiddenWorkspacesSettings />
      <WorkspaceDeletionSettings workspace={workspace} actorId={user?.id} />
    </div>
  );
}

interface WorkspaceMembersSettingsPanelProps extends WorkspacePanelStateProps {
  canManageWorkspaceMembers: boolean;
  canManageWorkspaceRoles: boolean;
  currentUserEmail: string | null;
  currentUserId: string | null;
}

export function WorkspaceMembersSettingsPanel({
  canManageWorkspaceMembers,
  canManageWorkspaceRoles,
  currentUserEmail,
  currentUserId,
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

  const invitationsDisabled =
    workspace.personal || (memberSettingsQuery.data?.disableInvite ?? false);

  return (
    <div className="h-full">
      <div className="space-y-8">
        <GuestSelfJoinSetting
          wsId={workspace.id}
          disabled={workspace.personal || !canManageWorkspaceMembers}
          embedded
        />
        {canManageWorkspaceMembers && !workspace.personal ? (
          <InviteLinksSection
            wsId={workspace.id}
            canManageMembers
            disableInvite={invitationsDisabled}
          />
        ) : null}
        <StandardWorkspaceAccessPage
          disableInvite={invitationsDisabled}
          initialContext={{
            canManageMembers: canManageWorkspaceMembers,
            canManageRoles: canManageWorkspaceRoles,
            currentUserEmail,
            currentUserId,
            workspaceId: workspace.id,
          }}
          initialTab="people"
          showHeader={false}
        />
      </div>
    </div>
  );
}
