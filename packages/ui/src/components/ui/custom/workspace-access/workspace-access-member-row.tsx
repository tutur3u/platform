'use client';

import {
  Crown,
  ShieldUser,
  User as UserIcon,
  UserMinus,
  X,
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
  shouldShowProtectedMemberStatus,
} from './member-filter-utils';
import type { WorkspaceAccessLabels, WorkspaceAccessRole } from './types';

type GuestContext = InternalApiEnhancedWorkspaceMember & {
  direct_board_guest?: boolean;
  guest_board_count?: number;
  guest_board_names?: string[];
  guest_highest_permission?: 'edit' | 'view' | null;
};

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
  const guest = member as GuestContext;
  const canRemoveRoles = canManageRoles && memberId && !member.pending;

  const accent = member.pending
    ? 'before:bg-dynamic-orange'
    : guest.direct_board_guest || member.workspace_member_type === 'GUEST'
      ? 'before:bg-dynamic-blue'
      : member.is_creator
        ? 'before:bg-dynamic-yellow'
        : 'before:bg-transparent';

  return (
    <article
      className={`group relative overflow-hidden rounded-xl border bg-background pl-4 transition-colors before:absolute before:inset-y-0 before:left-0 before:w-1 hover:border-foreground/20 sm:pl-5 ${accent} ${member.pending ? 'border-dashed' : ''}`}
    >
      <div className="p-3 pl-0 sm:p-4 sm:pl-0">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <Avatar className="size-10 border border-border sm:size-11">
            <AvatarImage src={member.avatar_url ?? undefined} />
            <AvatarFallback className="font-semibold">
              {member.display_name ? (
                getInitials(member.display_name)
              ) : (
                <UserIcon className="h-5 w-5" />
              )}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate font-semibold text-sm sm:text-base">
                {memberName}
              </p>
              {member.is_creator ? (
                <Badge className="h-5 gap-1 border-dynamic-yellow/50 bg-dynamic-yellow/10 px-1.5 text-dynamic-yellow text-xs">
                  <Crown className="h-3 w-3" />
                  {t('ws-members.creator_badge')}
                </Badge>
              ) : null}
              {member.pending ? (
                <Badge className="h-5 border-dynamic-orange/50 bg-dynamic-orange/10 px-1.5 text-dynamic-orange text-xs">
                  {t('ws-members.invited')}
                </Badge>
              ) : null}
              {member.workspace_member_type === 'GUEST' ? (
                <Badge className="h-5 border-foreground/20 bg-foreground/5 px-1.5 text-foreground/80 text-xs">
                  {guest.direct_board_guest
                    ? t('ws-members.direct_board_guest_badge')
                    : t('ws-members.guest_badge')}
                </Badge>
              ) : null}
              {guest.direct_board_guest ? (
                <Badge className="h-5 border-dynamic-blue/50 bg-dynamic-blue/10 px-1.5 text-dynamic-blue text-xs">
                  {guest.guest_highest_permission === 'edit'
                    ? t('ws-members.board_guest_can_edit')
                    : t('ws-members.board_guest_can_view')}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-muted-foreground text-xs sm:text-sm">
              {member.email ||
                (member.handle ? `@${member.handle}` : t('common.unknown'))}
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5 sm:mt-3">
          {member.roles.length > 0 ? (
            member.roles.map((role) => (
              <Badge
                key={`${member.id ?? member.email}-${role.id}`}
                className="h-5 gap-1 border-dynamic-purple/40 bg-dynamic-purple/10 px-1.5 text-dynamic-purple text-xs"
              >
                <span>{role.name}</span>
                {canRemoveRoles ? (
                  <button
                    type="button"
                    className="rounded-full p-0.5 transition-colors hover:bg-dynamic-purple/20"
                    onClick={() =>
                      onRemoveRole({ roleId: role.id, userId: memberId })
                    }
                    aria-label={t('common.delete')}
                  >
                    <X className="h-3 w-3" />
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

        {guest.direct_board_guest ? (
          <div className="mt-3 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-2.5 text-sm sm:p-3">
            <div className="font-medium text-dynamic-blue">
              {t('ws-members.direct_board_guest_scope_title')}
            </div>
            <p className="mt-1 text-muted-foreground">
              {t('ws-members.direct_board_guest_scope_description', {
                count: guest.guest_board_count ?? 0,
              })}
            </p>
            {guest.guest_board_names?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {guest.guest_board_names.slice(0, 4).map((name) => (
                  <Badge key={name} variant="outline" className="text-xs">
                    {name}
                  </Badge>
                ))}
                {guest.guest_board_names.length > 4 ? (
                  <Badge variant="outline" className="text-xs">
                    +{guest.guest_board_names.length - 4}
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 border-border border-t pt-3 text-sm">
          {member.created_at ? (
            <div className="text-muted-foreground text-xs">
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
          ) : (
            <span />
          )}

          <div className="flex min-w-0 items-center gap-2">
            {canRemoveRoles ? (
              <Select
                onValueChange={(roleId) =>
                  onAssignRole({ roleId, userId: memberId })
                }
              >
                <SelectTrigger className="h-9 min-w-0 flex-1">
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
                size="sm"
                className="size-9 shrink-0 px-0 sm:w-auto sm:px-3"
                disabled={isMutating}
                onClick={() =>
                  onRemoveMember({
                    email: member.email,
                    userId: member.pending ? null : member.id,
                  })
                }
              >
                <UserMinus className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">
                  {labels.removeMemberAction}
                </span>
                <span className="sr-only sm:hidden">
                  {labels.removeMemberAction}
                </span>
              </Button>
            ) : shouldShowProtectedMemberStatus({
                isCreator: member.is_creator,
              }) ? (
              <div className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground sm:w-auto sm:gap-2 sm:px-3 sm:py-1.5">
                <ShieldUser className="h-3.5 w-3.5" />
                <span className="hidden text-xs sm:inline">
                  {labels.protectedMemberLabel}
                </span>
                <span className="sr-only sm:hidden">
                  {labels.protectedMemberLabel}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
