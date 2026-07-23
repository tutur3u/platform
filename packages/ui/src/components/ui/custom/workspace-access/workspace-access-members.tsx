'use client';

import { UsersRound } from '@tuturuuu/icons';
import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import type { WorkspaceAccessLabels, WorkspaceAccessRole } from './types';
import { WorkspaceAccessMemberRow } from './workspace-access-member-row';

type Props = {
  canEditProfiles: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
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
  roles: Array<Pick<WorkspaceAccessRole, 'id' | 'name'>>;
  searchTerm: string;
  status: string;
};

export function WorkspaceAccessMembers({
  canEditProfiles,
  canManageMembers,
  canManageRoles,
  defaultAdminEnabled,
  isLoading,
  isMutating,
  labels,
  members,
  onAssignRole,
  onEditMemberProfile,
  onRemoveMember,
  onRemoveRole,
  roles,
  searchTerm,
  status,
}: Props) {
  const t = useTranslations() as (key: string) => string;

  if (isLoading) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-border border-dashed p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground">
          <UsersRound className="h-6 w-6" />
        </div>
        <p className="text-muted-foreground text-sm">
          {searchTerm.trim()
            ? t('ws-members.no_members_match')
            : status === 'invited'
              ? t('ws-members.no_invited_members_found')
              : t('ws-members.no_members_found')}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {members.map((member) => (
        <WorkspaceAccessMemberRow
          key={`${member.id ?? member.email ?? member.handle}`}
          canEditProfiles={canEditProfiles}
          canManageMembers={canManageMembers}
          canManageRoles={canManageRoles}
          defaultAdminEnabled={defaultAdminEnabled}
          isMutating={isMutating}
          labels={labels}
          member={member}
          onAssignRole={onAssignRole}
          onEditMemberProfile={onEditMemberProfile}
          onRemoveMember={onRemoveMember}
          onRemoveRole={onRemoveRole}
          roles={roles}
        />
      ))}
    </div>
  );
}
