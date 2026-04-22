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
import { useTranslations } from 'next-intl';
import { getAvailableRolesForMember } from './cms-members-shared';

export function CmsMemberCards({
  canManageMembers,
  canManageRoles,
  isLoading,
  isRemovingMember,
  members,
  roles,
  onAssignRole,
  onRemoveMember,
  onRemoveRole,
}: {
  canManageMembers: boolean;
  canManageRoles: boolean;
  isLoading: boolean;
  isRemovingMember: boolean;
  members: InternalApiEnhancedWorkspaceMember[];
  roles: Array<Pick<WorkspaceRoleDetails, 'id' | 'name'>>;
  onAssignRole: (payload: { roleId: string; userId: string }) => void;
  onRemoveMember: (payload: {
    email?: string | null;
    userId?: string | null;
  }) => void;
  onRemoveRole: (payload: { roleId: string; userId: string }) => void;
}) {
  const t = useTranslations();
  const tSettings = useTranslations('external-projects.settings');

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <Card className="border-border/70 bg-card/95 shadow-none">
        <CardContent className="flex min-h-[180px] items-center justify-center text-muted-foreground text-sm">
          {t('ws-members.no_members_match')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {members.map((member) => {
        const memberId = member.id ?? null;
        const availableRoles = getAvailableRolesForMember(member, roles);

        return (
          <Card
            key={`${member.id ?? member.email ?? member.handle}`}
            className="border-border/70 bg-card/95 shadow-none"
          >
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={member.avatar_url ?? undefined} />
                    <AvatarFallback className="font-semibold">
                      {getInitials(
                        member.display_name ||
                          member.email ||
                          member.handle ||
                          '?'
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">
                        {member.display_name ||
                          member.email ||
                          member.handle ||
                          t('common.unknown')}
                      </div>
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
                    <div className="text-muted-foreground text-sm">
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
                            className="gap-1 rounded-full pr-1"
                          >
                            <span>{role.name}</span>
                            {canManageRoles && memberId && !member.pending ? (
                              <button
                                type="button"
                                className="rounded-full px-1 py-0.5 transition hover:bg-foreground/10"
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

                <div className="flex min-w-[220px] flex-col gap-2">
                  {canManageRoles && memberId && !member.pending ? (
                    <Select
                      onValueChange={(roleId) =>
                        onAssignRole({
                          roleId,
                          userId: memberId,
                        })
                      }
                    >
                      <SelectTrigger>
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
                      className="justify-start"
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
                    <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                      <ShieldUser className="h-4 w-4" />
                      {tSettings('protected_member_label')}
                    </div>
                  )}
                </div>
              </div>

              {member.created_at ? (
                <div className="text-muted-foreground text-sm">
                  {new Date(member.created_at).toLocaleString()}
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
