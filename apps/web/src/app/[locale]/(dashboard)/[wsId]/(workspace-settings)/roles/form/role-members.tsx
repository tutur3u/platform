import { useQuery } from '@tanstack/react-query';
import { Plus, Search, User, UserPlus, Users, X } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { SectionProps } from './index';

export default function RoleFormMembersSection({
  wsId,
  roleId,
  form,
  onUpdate,
}: SectionProps & {
  onUpdate: React.Dispatch<React.SetStateAction<number>>;
}) {
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = useState('');
  const [addMemberQuery, setAddMemberQuery] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);

  const workspaceMembersQuery = useQuery({
    queryKey: ['workspaces', wsId, 'members'],
    queryFn: () => getWorkspaceUsers(wsId),
  });

  const roleMembersQuery = useQuery({
    queryKey: ['workspaces', wsId, 'roles', roleId, 'members'],
    queryFn: roleId ? () => getRoleMembers(roleId) : undefined,
    enabled: !!roleId,
  });

  const allUsers = workspaceMembersQuery.data?.data || [];
  const roleMembers = roleMembersQuery.data?.data || [];

  useEffect(() => {
    if (roleMembersQuery.isFetched) onUpdate(roleMembersQuery.data?.count || 0);
  }, [roleMembersQuery.isFetched, roleMembersQuery.data?.count, onUpdate]);

  // Filter role members based on search query (display_name, full_name, email)
  const filteredRoleMembers = useMemo(() => {
    if (!searchQuery) return roleMembers;

    const query = searchQuery.toLowerCase().trim();
    return roleMembers.filter((member) => {
      const user = allUsers.find((u) => u.id === member.id);
      if (!user) return false;

      return (
        user.display_name?.toLowerCase().includes(query) ||
        user.full_name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query)
      );
    });
  }, [roleMembers, allUsers, searchQuery]);

  // Get available users to add (not already in role)
  const availableUsers = useMemo(() => {
    const roleMemberIds = new Set(roleMembers.map((m) => m.id));
    const available = allUsers.filter((u) => !roleMemberIds.has(u.id));

    if (!addMemberQuery) return available;

    const query = addMemberQuery.toLowerCase().trim();
    return available.filter(
      (user) =>
        user.display_name?.toLowerCase().includes(query) ||
        user.full_name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query)
    );
  }, [allUsers, roleMembers, addMemberQuery]);

  const handleAddMember = async (memberId: string) => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/roles/${roleId}/members`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ memberIds: [memberId] }),
      }
    );

    if (res.ok) {
      toast.success(t('ws-roles.member_added_successfully'));
      roleMembersQuery.refetch();
      setAddMemberQuery('');
    } else {
      toast.error(t('ws-roles.failed_to_add_member'));
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/roles/${roleId}/members/${memberId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      toast.success(t('ws-roles.member_removed_successfully'));
      roleMembersQuery.refetch();
    } else {
      toast.error(t('ws-roles.failed_to_remove_member'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Role Name Header */}
      <div className="flex items-center gap-3 rounded-lg border border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/5 via-dynamic-blue/10 to-dynamic-purple/5 p-4 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-blue/20">
          <Users className="h-5 w-5 text-dynamic-blue" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-foreground/60 text-sm">
            {t('ws-roles.managing_members_for')}
          </div>
          <div className="font-bold text-dynamic-blue text-lg">
            {form.watch('name') || t('common.unnamed')}
          </div>
        </div>
        <Badge variant="secondary" className="h-fit px-3 py-1.5 text-base">
          {roleMembers.length}{' '}
          {roleMembers.length === 1
            ? t('ws-roles.member')
            : t('ws-roles.members')}
        </Badge>
      </div>

      {/* Add Members Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 font-semibold text-base">
            <UserPlus className="h-4 w-4" />
            {t('ws-roles.add_members')}
          </Label>
          <Button
            type="button"
            size="sm"
            variant={showAddMembers ? 'outline' : 'secondary'}
            onClick={() => setShowAddMembers(!showAddMembers)}
          >
            {showAddMembers ? (
              <>
                <X className="mr-1.5 h-4 w-4" />
                {t('common.close')}
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('ws-roles.add_member')}
              </>
            )}
          </Button>
        </div>

        {showAddMembers && (
          <div className="space-y-3 rounded-lg border bg-background/50 p-4">
            <div className="relative">
              <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('ws-roles.search_members_to_add_placeholder')}
                value={addMemberQuery}
                onChange={(e) => setAddMemberQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {availableUsers.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
                <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="font-medium text-muted-foreground">
                  {addMemberQuery
                    ? t('ws-roles.no_matching_users_found')
                    : t('ws-roles.all_members_already_added')}
                </p>
              </div>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {availableUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-accent"
                  >
                    <div className="flex flex-1 items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar_url ?? undefined} />
                        <AvatarFallback>
                          {user.display_name ? (
                            getInitials(user.display_name)
                          ) : (
                            <User className="h-5 w-5" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <div className="truncate font-semibold">
                          {user.display_name ||
                            user.full_name ||
                            t('common.unnamed')}
                        </div>
                        {user.email && (
                          <div className="truncate text-muted-foreground text-sm">
                            {user.email}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAddMember(user.id)}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      {t('common.add')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* Current Members Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 font-semibold text-base">
            <Users className="h-4 w-4" />
            {t('ws-roles.current_members')} ({filteredRoleMembers.length})
          </Label>
        </div>

        {/* Search Current Members */}
        {roleMembers.length > 0 && (
          <div className="relative">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('ws-roles.search_current_members_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {/* Members List */}
        {filteredRoleMembers.length > 0 ? (
          <div className="space-y-2">
            {filteredRoleMembers.map((member) => {
              const user = allUsers.find((u) => u.id === member.id);
              if (!user) return null;

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-accent/50"
                >
                  <div className="flex flex-1 items-center gap-3">
                    <Avatar className="h-12 w-12 ring-2 ring-primary/20">
                      <AvatarImage src={user.avatar_url ?? undefined} />
                      <AvatarFallback>
                        {user.display_name ? (
                          getInitials(user.display_name)
                        ) : (
                          <User className="h-5 w-5" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="truncate font-semibold text-base">
                        {user.display_name ||
                          user.full_name ||
                          t('common.unnamed')}
                      </div>
                      {user.email && (
                        <div className="truncate text-muted-foreground">
                          {user.email}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRemoveMember(member.id)}
                  >
                    <X className="mr-1 h-4 w-4" />
                    {t('common.remove')}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
            <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 font-semibold">
              {searchQuery
                ? t('ws-roles.no_members_match_search')
                : t('ws-roles.no_members_assigned')}
            </p>
            <p className="text-muted-foreground text-sm">
              {searchQuery
                ? t('ws-roles.try_different_search_term')
                : t('ws-roles.add_members_to_get_started')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

async function getWorkspaceUsers(wsId: string) {
  const supabase = createClient();

  const queryBuilder = supabase
    .from('workspace_members')
    .select(
      'id:user_id, ...users(display_name, full_name, avatar_url, ...user_private_details(email))',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('user_id');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUser[]; count: number };
}

async function getRoleMembers(roleId: string) {
  const supabase = createClient();

  const queryBuilder = supabase
    .from('workspace_role_members')
    .select('...users!inner(id, display_name, avatar_url)', {
      count: 'exact',
    })
    .eq('role_id', roleId);

  const { data, count, error } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceUser[]; count: number };
}
