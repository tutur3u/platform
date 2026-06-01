'use client';

import {
  Crown,
  ShieldUser,
  User as UserIcon,
  UserMinus,
} from '@tuturuuu/icons';
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
import moment from 'moment';
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
  const t = useTranslations();
  const locale = useLocale();
  const memberId = member.id ?? null;
  const availableRoles = getAvailableRolesForMember(member, roles);
  const memberName = getMemberDisplayName(member, t('common.unknown'));
  const guestContext = member as InternalApiEnhancedWorkspaceMember & {
    direct_board_guest?: boolean;
    guest_board_count?: number;
    guest_board_names?: string[];
    guest_highest_permission?: 'edit' | 'view' | null;
  };

  return (
    <article
      className={`relative rounded-lg border p-4 transition-colors ${
        member.pending
          ? 'border-dashed bg-transparent'
          : 'bg-primary-foreground/20 hover:bg-primary-foreground/30'
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar>
          <AvatarImage src={member.avatar_url ?? undefined} />
          <AvatarFallback className="font-semibold">
            {member.display_name ? (
              getInitials(member.display_name)
            ) : (
              <UserIcon className="h-5 w-5" />
            )}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-semibold lg:text-lg">{memberName}</p>
            {member.is_creator ? (
              <Badge className="h-5 gap-1 border-dynamic-yellow/50 bg-dynamic-yellow/10 px-1.5 text-dynamic-yellow text-xs">
                <Crown className="h-3 w-3" />
                {t('ws-members.creator_badge')}
              </Badge>
            ) : null}
            {member.pending ? (
              <Badge variant="outline" className="h-5 px-1.5 text-xs">
                {t('ws-members.invited')}
              </Badge>
            ) : null}
            {member.workspace_member_type === 'GUEST' ? (
              <Badge className="h-5 border-foreground/20 bg-foreground/5 px-1.5 text-foreground/80 text-xs">
                {guestContext.direct_board_guest
                  ? t('ws-members.direct_board_guest_badge')
                  : t('ws-members.guest_badge')}
              </Badge>
            ) : null}
            {guestContext.direct_board_guest ? (
              <Badge className="h-5 border-dynamic-blue/50 bg-dynamic-blue/10 px-1.5 text-dynamic-blue text-xs">
                {guestContext.guest_highest_permission === 'edit'
                  ? t('ws-members.board_guest_can_edit')
                  : t('ws-members.board_guest_can_view')}
              </Badge>
            ) : null}
          </div>

          <p className="truncate font-semibold text-muted-foreground text-sm">
            {member.email ||
              (member.handle ? `@${member.handle}` : t('common.unknown'))}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {member.roles.length > 0 ? (
          member.roles.map((role) => (
            <Badge
              key={`${member.id ?? member.email}-${role.id}`}
              className="h-5 gap-1 border-dynamic-purple/50 bg-dynamic-purple/10 px-1.5 text-dynamic-purple text-xs"
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
          <Badge variant="outline" className="h-5 px-1.5 text-xs">
            {labels.noRolesLabel}
          </Badge>
        )}
      </div>

      {guestContext.direct_board_guest ? (
        <div className="mt-3 rounded-md border border-dynamic-blue/20 bg-dynamic-blue/5 p-3 text-sm">
          <div className="font-medium text-dynamic-blue">
            {t('ws-members.direct_board_guest_scope_title')}
          </div>
          <p className="mt-1 text-muted-foreground">
            {t('ws-members.direct_board_guest_scope_description', {
              count: guestContext.guest_board_count ?? 0,
            })}
          </p>
          {guestContext.guest_board_names?.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {guestContext.guest_board_names.slice(0, 4).map((name) => (
                <Badge key={name} variant="outline" className="text-xs">
                  {name}
                </Badge>
              ))}
              {guestContext.guest_board_names.length > 4 ? (
                <Badge variant="outline" className="text-xs">
                  +{guestContext.guest_board_names.length - 4}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-3 border-t pt-3 text-sm md:flex-row md:items-center md:justify-between">
        {member.created_at ? (
          <div className="text-muted-foreground">
            <span>
              {t(
                member.pending
                  ? 'ws-members.invited'
                  : 'ws-members.member_since'
              )}
            </span>{' '}
            <span className="font-semibold text-foreground">
              {moment(member.created_at).locale(locale).fromNow()}
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
    </article>
  );
}
