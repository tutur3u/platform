'use client';

import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import type { WorkspaceAccessLabels, WorkspaceAccessRole } from './types';
import { WorkspaceAccessMemberRow } from './workspace-access-member-row';

type Props = {
  canManageMembers: boolean;
  canManageRoles: boolean;
  isLoading: boolean;
  isMutating: boolean;
  labels: WorkspaceAccessLabels;
  members: InternalApiEnhancedWorkspaceMember[];
  onAssignRole: (payload: { roleId: string; userId: string }) => void;
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
  canManageMembers,
  canManageRoles,
  isLoading,
  isMutating,
  labels,
  members,
  onAssignRole,
  onRemoveMember,
  onRemoveRole,
  roles,
  searchTerm,
  status,
}: Props) {
  const t = useTranslations() as (key: string) => string;

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4">
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
        {searchTerm.trim()
          ? t('ws-members.no_members_match')
          : status === 'invited'
            ? t('ws-members.no_invited_members_found')
            : t('ws-members.no_members_found')}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="divide-y">
        {members.map((member) => (
          <WorkspaceAccessMemberRow
            key={`${member.id ?? member.email ?? member.handle}`}
            canManageMembers={canManageMembers}
            canManageRoles={canManageRoles}
            isMutating={isMutating}
            labels={labels}
            member={member}
            onAssignRole={onAssignRole}
            onRemoveMember={onRemoveMember}
            onRemoveRole={onRemoveRole}
            roles={roles}
          />
        ))}
      </div>
    </div>
  );
}
