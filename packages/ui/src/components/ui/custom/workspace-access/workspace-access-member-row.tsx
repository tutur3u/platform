'use client';

import { ShieldUser, UserMinus } from '@tuturuuu/icons';
import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useLocale, useTranslations } from 'next-intl';
import {
  getAvailableRolesForMember,
  getMemberDisplayName,
} from './member-filter-utils';
import type { WorkspaceAccessLabels, WorkspaceAccessRole } from './types';

type Props = {
  canManageMembers: boolean;
  canManageRoles: boolean;
  isMutating: boolean;
  labels: WorkspaceAccessLabels;
  member: InternalApiEnhancedWorkspaceMember;
  onAssignRole: (payload: { roleId: string; userId: string }) => void;
  onRemoveMember: (payload: {
    email?: null | string;
    userId?: null | string;
  }) => void;
  onRemoveRole: (payload: { roleId: string; userId: string }) => void;
  roles: Array<Pick<WorkspaceAccessRole, 'id' | 'name'>>;
};

export function WorkspaceAccessMemberRow({
  canManageMembers,
  canManageRoles,
  isMutating,
  labels,
  member,
  onAssignRole,
  onRemoveMember,
  onRemoveRole,
  roles,
}: Props) {
  const t = useTranslations() as (key: string) => string;
  const locale = useLocale();
  const memberId = member.id ?? null;
  const availableRoles = getAvailableRolesForMember(member, roles);
  const memberName = getMemberDisplayName(member, t('common.unknown'));

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={member.avatar_url ?? undefined} />
          <AvatarFallback className="font-medium">
            {getInitials(memberName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate font-medium">{memberName}</div>
            {member.is_creator ? (
              <Badge variant="secondary" className="rounded-full">
                {t('ws-members.creator_badge')}
              </Badge>
            ) : null}
            {member.pending ? (
              <Badge variant="outline" className="rounded-full">
                {t('ws-members.invited')}
              </Badge>
            ) : null}
            {member.workspace_member_type === 'GUEST' ? (
              <Badge variant="outline" className="rounded-full">
                {t('ws-members.guest_badge')}
              </Badge>
            ) : null}
          </div>

          <div className="truncate text-muted-foreground text-sm">
            {member.email ||
              (member.handle ? `@${member.handle}` : t('common.unknown'))}
          </div>

          <div className="flex flex-wrap gap-2">
            {member.roles.length > 0 ? (
              member.roles.map((role) => (
                <Badge
                  key={`${member.id}-${role.id}`}
                  variant="secondary"
                  className="gap-1 rounded-full"
                >
                  <span>{role.name}</span>
                  {canManageRoles && memberId && !member.pending ? (
                    <button
                      type="button"
                      className="rounded-full px-1 hover:bg-foreground/10"
                      onClick={() =>
                        onRemoveRole({
                          roleId: role.id,
                          userId: memberId,
                        })
                      }
                      aria-label={t('common.delete')}
                    >
                      x
                    </button>
                  ) : null}
                </Badge>
              ))
            ) : (
              <Badge variant="outline" className="rounded-full">
                {labels.noRolesLabel}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:min-w-[250px] lg:items-end">
        <div className="text-muted-foreground text-xs">
          {member.created_at
            ? new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(member.created_at))
            : ''}
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          {canManageRoles && memberId && !member.pending ? (
            <Select
              onValueChange={(roleId) =>
                onAssignRole({ roleId, userId: memberId })
              }
            >
              <SelectTrigger className="min-w-[180px]">
                <SelectValue placeholder={labels.assignRolePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.length === 0 ? (
                  <SelectItem value="__no_roles__" disabled>
                    {labels.noAdditionalRoles}
                  </SelectItem>
                ) : (
                  availableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          ) : null}

          {canManageMembers && !member.is_creator ? (
            <Button
              variant="outline"
              disabled={isMutating}
              onClick={() =>
                onRemoveMember({
                  email: member.email,
                  userId: member.pending ? null : member.id,
                })
              }
            >
              <UserMinus className="mr-2 h-4 w-4" />
              {labels.removeMemberAction}
            </Button>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-muted-foreground text-sm">
              <ShieldUser className="h-4 w-4" />
              {labels.protectedMemberLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
