'use client';

import { ShieldUser, UserMinus } from '@tuturuuu/icons';
import type { WorkspaceRoleDetails } from '@tuturuuu/internal-api';
import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useLocale, useTranslations } from 'next-intl';
import {
  type CmsMemberTab,
  getAvailableRolesForMember,
} from './cms-members-shared';

export function CmsMemberCards({
  activeTab,
  canManageMembers,
  canManageRoles,
  isLoading,
  isRemovingMember,
  members,
  onAssignRole,
  onRemoveMember,
  onRemoveRole,
  roles,
  searchTerm,
}: {
  activeTab: Exclude<CmsMemberTab, 'roles'>;
  canManageMembers: boolean;
  canManageRoles: boolean;
  isLoading: boolean;
  isRemovingMember: boolean;
  members: InternalApiEnhancedWorkspaceMember[];
  onAssignRole: (payload: { roleId: string; userId: string }) => void;
  onRemoveMember: (payload: {
    email?: string | null;
    userId?: string | null;
  }) => void;
  onRemoveRole: (payload: { roleId: string; userId: string }) => void;
  roles: Array<Pick<WorkspaceRoleDetails, 'id' | 'name'>>;
  searchTerm: string;
}) {
  const t = useTranslations();
  const tSettings = useTranslations('external-projects.settings');
  const locale = useLocale();

  if (isLoading) {
    return (
      <Card className="border-border/70 shadow-none">
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (members.length === 0) {
    return (
      <Card className="border-border/70 shadow-none">
        <CardContent className="flex min-h-56 items-center justify-center p-6 text-center text-muted-foreground text-sm">
          {searchTerm.trim()
            ? t('ws-members.no_members_match')
            : activeTab === 'invited'
              ? t('ws-members.no_invited_members_found')
              : t('ws-members.no_members_found')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="divide-y divide-border p-0">
        {members.map((member) => {
          const memberId = member.id ?? null;
          const availableRoles = getAvailableRolesForMember(member, roles);
          const memberName =
            member.display_name ||
            member.email ||
            member.handle ||
            t('common.unknown');

          return (
            <div
              key={`${member.id ?? member.email ?? member.handle}`}
              className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={member.avatar_url ?? undefined} />
                  <AvatarFallback className="font-medium">
                    {getInitials(
                      member.display_name ||
                        member.email ||
                        member.handle ||
                        '?'
                    )}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate font-medium">{memberName}</div>
                    {member.is_creator ? (
                      <Badge variant="secondary" className="rounded-full">
                        {tSettings('creator_badge')}
                      </Badge>
                    ) : null}
                    {member.pending ? (
                      <Badge variant="outline" className="rounded-full">
                        {tSettings('invited_badge')}
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
                      (member.handle
                        ? `@${member.handle}`
                        : tSettings('no_email_label'))}
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
                            >
                              ×
                            </button>
                          ) : null}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="rounded-full">
                        {tSettings('no_roles_label')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 lg:min-w-[240px] lg:items-end">
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
                        onAssignRole({
                          roleId,
                          userId: memberId,
                        })
                      }
                    >
                      <SelectTrigger className="min-w-[180px]">
                        <SelectValue
                          placeholder={tSettings('assign_role_placeholder')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRoles.length === 0 ? (
                          <SelectItem value="__no_roles__" disabled>
                            {tSettings('no_additional_roles')}
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
                      disabled={isRemovingMember}
                      onClick={() =>
                        onRemoveMember({
                          email: member.email,
                          userId: member.pending ? null : member.id,
                        })
                      }
                    >
                      <UserMinus className="mr-2 h-4 w-4" />
                      {tSettings('remove_access_action')}
                    </Button>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-muted-foreground text-sm">
                      <ShieldUser className="h-4 w-4" />
                      {tSettings('protected_member_label')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
