'use client';

import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import {
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '../settings-section';
import type { WorkspaceAccessLabels, WorkspaceAccessRole } from './types';
import { WorkspaceAccessMemberRow } from './workspace-access-member-row';

type Props = {
  canEditProfiles: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
  canUpdateInvitationRoles: boolean;
  defaultAdminEnabled: boolean;
  isLoading: boolean;
  isMutating: boolean;
  labels: WorkspaceAccessLabels;
  members: InternalApiEnhancedWorkspaceMember[];
  onAssignRole: (payload: { roleId: string; userId: string }) => void;
  onEditMemberProfile: (member: InternalApiEnhancedWorkspaceMember) => void;
  onRemoveMember: (payload: {
    email?: null | string;
    userId?: null | string;
  }) => void;
  onRemoveRole: (payload: { roleId: string; userId: string }) => void;
  onUpdateInvitationRole: (payload: {
    email?: null | string;
    roleIds: string[];
    userId?: null | string;
  }) => void;
  roles: Array<Pick<WorkspaceAccessRole, 'id' | 'name'>>;
  searchTerm: string;
  status: string;
};

export function WorkspaceAccessMembers({
  canEditProfiles,
  canManageMembers,
  canManageRoles,
  canUpdateInvitationRoles,
  defaultAdminEnabled,
  isLoading,
  isMutating,
  labels,
  members,
  onAssignRole,
  onEditMemberProfile,
  onRemoveMember,
  onRemoveRole,
  onUpdateInvitationRole,
  roles,
  searchTerm,
  status,
}: Props) {
  const t = useTranslations() as (key: string) => string;

  if (isLoading) {
    return ['first', 'second', 'third', 'fourth'].map((row) => (
      <SettingsSectionBlock className="py-3" key={row}>
        <Skeleton className="h-14 rounded-lg" />
      </SettingsSectionBlock>
    ));
  }

  if (members.length === 0) {
    return (
      <SettingsSectionMessage>
        {searchTerm.trim()
          ? t('ws-members.no_members_match')
          : status === 'invited'
            ? t('ws-members.no_invited_members_found')
            : t('ws-members.no_members_found')}
      </SettingsSectionMessage>
    );
  }

  return members.map((member) => (
    <WorkspaceAccessMemberRow
      key={`${member.id ?? member.email ?? member.handle}`}
      canEditProfiles={canEditProfiles}
      canManageMembers={canManageMembers}
      canManageRoles={canManageRoles}
      canUpdateInvitationRoles={canUpdateInvitationRoles}
      defaultAdminEnabled={defaultAdminEnabled}
      isMutating={isMutating}
      labels={labels}
      member={member}
      onAssignRole={onAssignRole}
      onEditMemberProfile={onEditMemberProfile}
      onRemoveMember={onRemoveMember}
      onRemoveRole={onRemoveRole}
      onUpdateInvitationRole={onUpdateInvitationRole}
      roles={roles}
    />
  ));
}
