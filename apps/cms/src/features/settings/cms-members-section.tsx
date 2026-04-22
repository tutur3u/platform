'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, ShieldUser, UserMinus, Users } from '@tuturuuu/icons';
import {
  addRoleMembers,
  inviteWorkspaceMembers,
  listEnhancedWorkspaceMembers,
  listWorkspaceRoles,
  removeRoleMember,
  removeWorkspaceMember,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type CmsMembersSectionProps = {
  canManageMembers: boolean;
  canManageRoles: boolean;
  workspaceId: string;
};

function parseInviteEmails(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

export function CmsMembersSection({
  canManageMembers,
  canManageRoles,
  workspaceId,
}: CmsMembersSectionProps) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const tSettings = useTranslations('external-projects.settings');
  const [inviteEmails, setInviteEmails] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  const membersQuery = useQuery({
    queryFn: () => listEnhancedWorkspaceMembers(workspaceId),
    queryKey: ['cms-members', workspaceId],
    staleTime: 30_000,
  });
  const rolesQuery = useQuery({
    enabled: canManageRoles,
    queryFn: () => listWorkspaceRoles(workspaceId),
    queryKey: ['cms-member-roles', workspaceId],
    staleTime: 30_000,
  });

  const inviteMutation = useMutation({
    mutationFn: async () =>
      inviteWorkspaceMembers(workspaceId, parseInviteEmails(inviteEmails)),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('common.error')),
    onSuccess: (result) => {
      setInviteEmails('');
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ['cms-members', workspaceId] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (payload: {
      email?: string | null;
      userId?: string | null;
    }) => removeWorkspaceMember(workspaceId, payload),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('common.error')),
    onSuccess: () => {
      toast.success(t('common.deleted'));
      queryClient.invalidateQueries({ queryKey: ['cms-members', workspaceId] });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async (payload: {
      action: 'add' | 'remove';
      roleId: string;
      userId: string;
    }) => {
      if (payload.action === 'add') {
        return addRoleMembers(workspaceId, payload.roleId, [payload.userId]);
      }

      return removeRoleMember(workspaceId, payload.roleId, payload.userId);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('common.error')),
    onSuccess: () => {
      toast.success(t('common.saved'));
      queryClient.invalidateQueries({ queryKey: ['cms-members', workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ['cms-member-roles', workspaceId],
      });
    },
  });

  const visibleMembers = (membersQuery.data ?? []).filter((member) => {
    if (!memberSearch.trim()) {
      return true;
    }

    const query = memberSearch.toLowerCase();
    return [member.display_name, member.email, member.handle]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(query));
  });

  return (
    <Card className="border-border/70 bg-card/95 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          {tSettings('members_title')}
        </CardTitle>
        <CardDescription>{tSettings('members_description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cms-member-search">
              {tSettings('search_members_label')}
            </Label>
            <Input
              id="cms-member-search"
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
              placeholder={tSettings('search_members_placeholder')}
            />
          </div>

          {canManageMembers ? (
            <div className="grid gap-2">
              <Label htmlFor="cms-member-invites">
                {tSettings('invite_members_label')}
              </Label>
              <Textarea
                id="cms-member-invites"
                rows={4}
                value={inviteEmails}
                onChange={(event) => setInviteEmails(event.target.value)}
                placeholder={tSettings('invite_members_placeholder')}
              />
              <Button
                className="w-full sm:w-fit"
                disabled={
                  inviteMutation.isPending ||
                  parseInviteEmails(inviteEmails).length === 0
                }
                onClick={() => inviteMutation.mutate()}
              >
                <MailPlus className="mr-2 h-4 w-4" />
                {tSettings('send_invites_action')}
              </Button>
            </div>
          ) : null}
        </div>

        {membersQuery.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-3">
            {visibleMembers.map((member) => {
              const memberId = member.id ?? null;
              const availableRoles = (rolesQuery.data ?? []).filter(
                (role) =>
                  !member.roles.some(
                    (assignedRole) => assignedRole.id === role.id
                  )
              );

              return (
                <div
                  key={`${member.id ?? member.email}`}
                  className="rounded-[1.35rem] border border-border/70 bg-background/80 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">
                          {member.display_name ||
                            member.email ||
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
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {member.email || tSettings('no_email_label')}
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
                              {canManageRoles && memberId ? (
                                <button
                                  type="button"
                                  className="rounded-full px-1 py-0.5 transition hover:bg-foreground/10"
                                  onClick={() =>
                                    roleMutation.mutate({
                                      action: 'remove',
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

                    <div className="flex min-w-[220px] flex-col gap-2">
                      {canManageRoles && memberId ? (
                        <Select
                          onValueChange={(roleId) =>
                            roleMutation.mutate({
                              action: 'add',
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
                          disabled={removeMemberMutation.isPending}
                          onClick={() =>
                            removeMemberMutation.mutate({
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
                </div>
              );
            })}

            {visibleMembers.length === 0 ? (
              <div className="rounded-[1.35rem] border border-border/70 border-dashed bg-background/70 p-6 text-muted-foreground text-sm">
                {tSettings('no_members_match')}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
