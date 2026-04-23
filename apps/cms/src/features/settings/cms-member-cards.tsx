'use client';

import {
  Clock3,
  KeyRound,
  Search,
  ShieldUser,
  UserMinus,
  Users,
} from '@tuturuuu/icons';
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
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useLocale, useTranslations } from 'next-intl';
import {
  type CmsMemberTab,
  getAvailableRolesForMember,
  getMemberAccessProfile,
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
      <div className="grid gap-4 2xl:grid-cols-2">
        <Skeleton className="h-[274px] rounded-[1.75rem]" />
        <Skeleton className="h-[274px] rounded-[1.75rem]" />
        <Skeleton className="h-[274px] rounded-[1.75rem]" />
        <Skeleton className="h-[274px] rounded-[1.75rem]" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <Card className="overflow-hidden rounded-[1.75rem] border-border/70 bg-gradient-to-br from-background to-dynamic-blue/5 shadow-none">
        <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="rounded-full border border-border/70 bg-background/80 p-4 text-muted-foreground">
            {searchTerm.trim() ? (
              <Search className="h-6 w-6" />
            ) : (
              <Users className="h-6 w-6" />
            )}
          </div>
          <div className="space-y-1">
            <div className="font-medium text-base text-foreground">
              {searchTerm.trim()
                ? t('ws-members.no_members_match')
                : activeTab === 'invited'
                  ? t('ws-members.no_invited_members_found')
                  : t('ws-members.no_members_found')}
            </div>
            <div className="text-muted-foreground text-sm">
              {tSettings('directory_description')}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 2xl:grid-cols-2">
      {members.map((member) => {
        const accessProfile = getMemberAccessProfile(member);
        const availableRoles = getAvailableRolesForMember(member, roles);
        const memberId = member.id ?? null;
        const memberName =
          member.display_name ||
          member.email ||
          member.handle ||
          t('common.unknown');
        const dateLabel = member.pending
          ? t('ws-members.invited_on')
          : t('ws-members.member_since');

        return (
          <Card
            key={`${member.id ?? member.email ?? member.handle}`}
            className={cn(
              'overflow-hidden rounded-[1.75rem] border-border/70 shadow-none',
              member.pending
                ? 'bg-gradient-to-br from-background via-background to-dynamic-orange/5'
                : 'bg-gradient-to-br from-background via-background to-dynamic-blue/5'
            )}
          >
            <CardContent className="space-y-5 p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <Avatar className="h-12 w-12 border border-border/60">
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

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate font-semibold text-lg">
                          {memberName}
                        </div>
                        <StatusBadge member={member} />
                      </div>
                      <div className="truncate text-muted-foreground text-sm">
                        {member.email ||
                          (member.handle
                            ? `@${member.handle}`
                            : tSettings('no_email_label'))}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <MiniStat
                        label={tSettings('access_sources_label')}
                        tone={
                          member.pending
                            ? 'orange'
                            : accessProfile.hasRoleAccess
                              ? 'blue'
                              : 'neutral'
                        }
                        value={getAccessLabel({
                          hasDefaultAccess: accessProfile.hasDefaultAccess,
                          hasRoleAccess: accessProfile.hasRoleAccess,
                          t,
                        })}
                      />
                      <MiniStat
                        label={t('ws-members.permissions')}
                        tone="neutral"
                        value={accessProfile.uniquePermissionCount}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                        {t('common.roles')}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {member.roles.length > 0 ? (
                          member.roles.map((role) => (
                            <Badge
                              key={`${member.id}-${role.id}`}
                              variant="secondary"
                              className="gap-1 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 font-normal"
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
                </div>

                <div className="flex w-full min-w-[240px] flex-col gap-2 lg:w-[240px]">
                  {canManageRoles && memberId && !member.pending ? (
                    <Select
                      onValueChange={(roleId) =>
                        onAssignRole({
                          roleId,
                          userId: memberId,
                        })
                      }
                    >
                      <SelectTrigger className="bg-background/80">
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
                      className="justify-start bg-background/70"
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
                    <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 text-muted-foreground text-sm">
                      <ShieldUser className="h-4 w-4" />
                      {tSettings('protected_member_label')}
                    </div>
                  )}
                </div>
              </div>

              <Separator className="bg-border/60" />

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="inline-flex items-center gap-2 text-muted-foreground">
                  <Clock3 className="h-4 w-4" />
                  <span>{dateLabel}</span>
                </div>
                {member.created_at ? (
                  <div className="font-medium text-foreground">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(member.created_at))}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function StatusBadge({
  member,
}: {
  member: InternalApiEnhancedWorkspaceMember;
}) {
  const t = useTranslations();
  const tSettings = useTranslations('external-projects.settings');

  if (member.is_creator) {
    return <Badge className="rounded-full">{tSettings('creator_badge')}</Badge>;
  }

  if (member.pending) {
    return (
      <Badge
        variant="outline"
        className="rounded-full border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange"
      >
        {tSettings('invited_badge')}
      </Badge>
    );
  }

  if (member.workspace_member_type === 'GUEST') {
    return (
      <Badge variant="outline" className="rounded-full">
        {t('ws-members.guest_badge')}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="rounded-full">
      {t('ws-members.member')}
    </Badge>
  );
}

function MiniStat({
  label,
  tone = 'neutral',
  value,
}: {
  label: string;
  tone?: 'blue' | 'neutral' | 'orange';
  value: number | string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-3',
        tone === 'blue'
          ? 'border-dynamic-blue/25 bg-dynamic-blue/5'
          : tone === 'orange'
            ? 'border-dynamic-orange/25 bg-dynamic-orange/5'
            : 'border-border/60 bg-background/70'
      )}
    >
      <div className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {label}
      </div>
      <div className="mt-2 flex items-center gap-2 font-semibold text-base">
        {typeof value === 'number' ? <KeyRound className="h-4 w-4" /> : null}
        <span>{value}</span>
      </div>
    </div>
  );
}

function getAccessLabel({
  hasDefaultAccess,
  hasRoleAccess,
  t,
}: {
  hasDefaultAccess: boolean;
  hasRoleAccess: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  if (hasDefaultAccess && hasRoleAccess) {
    return t('ws-members.overlap');
  }

  if (hasRoleAccess) {
    return t('ws-members.only_roles');
  }

  if (hasDefaultAccess) {
    return t('ws-members.only_default');
  }

  return t('ws-members.no_permissions');
}
