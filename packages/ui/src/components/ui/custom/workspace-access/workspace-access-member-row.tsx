'use client';

import {
  Crown,
  Ellipsis,
  Pencil,
  Plus,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
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
  canEditProfiles: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
  defaultAdminEnabled: boolean;
  isMutating: boolean;
  labels: WorkspaceAccessLabels;
  member: InternalApiEnhancedWorkspaceMember;
  onAssignRole: (payload: { roleId: string; userId: string }) => void;
  onEditMemberProfile: (member: InternalApiEnhancedWorkspaceMember) => void;
  onRemoveMember: (payload: {
    email?: null | string;
    userId?: null | string;
  }) => void;
  onRemoveRole: (payload: { roleId: string; userId: string }) => void;
  roles: Array<Pick<WorkspaceAccessRole, 'id' | 'name'>>;
};

export function WorkspaceAccessMemberRow({
  canEditProfiles,
  canManageMembers,
  canManageRoles,
  defaultAdminEnabled,
  isMutating,
  labels,
  member,
  onAssignRole,
  onEditMemberProfile,
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
  const canEditProfile =
    canEditProfiles &&
    canManageMembers &&
    !guest.direct_board_guest &&
    Boolean(memberId || member.email);
  const inheritsAdministrator =
    defaultAdminEnabled &&
    !member.pending &&
    !guest.direct_board_guest &&
    member.workspace_member_type !== 'GUEST';
  const hasActions =
    Boolean(canRemoveRoles) ||
    canEditProfile ||
    (canManageMembers && !member.is_creator) ||
    shouldShowProtectedMemberStatus({ isCreator: member.is_creator });

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

          {hasActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={isMutating}
                  aria-label={t('common.actions')}
                >
                  <Ellipsis className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {canRemoveRoles ? (
                  <>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Plus className="size-4" />
                        {labels.assignRolePlaceholder}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-52">
                        {availableRoles.length === 0 ? (
                          <DropdownMenuItem disabled>
                            {labels.noAdditionalRoles}
                          </DropdownMenuItem>
                        ) : (
                          availableRoles.map((role) => (
                            <DropdownMenuItem
                              key={role.id}
                              onSelect={() =>
                                onAssignRole({
                                  roleId: role.id,
                                  userId: memberId,
                                })
                              }
                            >
                              <ShieldUser className="size-4" />
                              {role.name}
                            </DropdownMenuItem>
                          ))
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    {member.roles.length > 0 ? (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <X className="size-4" />
                          {t('common.remove')}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-52">
                          {member.roles.map((role) => (
                            <DropdownMenuItem
                              key={role.id}
                              variant="destructive"
                              onSelect={() =>
                                onRemoveRole({
                                  roleId: role.id,
                                  userId: memberId,
                                })
                              }
                            >
                              <X className="size-4" />
                              {role.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ) : null}
                  </>
                ) : null}

                {canEditProfile ? (
                  <>
                    {canRemoveRoles ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      onSelect={() => onEditMemberProfile(member)}
                    >
                      <Pencil className="size-4" />
                      {t('ws-members.profile_display_name')}
                    </DropdownMenuItem>
                  </>
                ) : null}

                {member.is_creator ? (
                  <>
                    {canRemoveRoles || canEditProfile ? (
                      <DropdownMenuSeparator />
                    ) : null}
                    <DropdownMenuLabel className="flex items-center gap-2 text-muted-foreground">
                      <ShieldUser className="size-4" />
                      {labels.protectedMemberLabel}
                    </DropdownMenuLabel>
                  </>
                ) : null}

                {canManageMembers && !member.is_creator ? (
                  <>
                    {canRemoveRoles || canEditProfile ? (
                      <DropdownMenuSeparator />
                    ) : null}
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() =>
                        onRemoveMember({
                          email: member.email,
                          userId: member.id,
                        })
                      }
                    >
                      <UserMinus className="size-4" />
                      {labels.removeMemberAction}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5 sm:mt-3">
          {member.roles.length > 0 ? (
            member.roles.map((role) => (
              <Badge
                key={`${member.id ?? member.email}-${role.id}`}
                className="h-5 gap-1 border-dynamic-purple/40 bg-dynamic-purple/10 px-1.5 text-dynamic-purple text-xs"
              >
                <span>{role.name}</span>
              </Badge>
            ))
          ) : inheritsAdministrator ? (
            <Badge className="h-5 gap-1 border-dynamic-green/40 bg-dynamic-green/10 px-1.5 text-dynamic-green text-xs">
              <ShieldUser className="size-3" />
              {t('ws-roles.admin')}
            </Badge>
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

        <div className="mt-3 border-border border-t pt-3 text-sm">
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
        </div>
      </div>
    </article>
  );
}
