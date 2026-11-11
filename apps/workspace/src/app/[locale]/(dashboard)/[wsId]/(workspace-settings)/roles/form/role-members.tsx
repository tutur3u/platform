import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
  User,
  UserPlus,
  Users,
  X,
} from '@tuturuuu/icons';
import {
  addRoleMembers,
  listRoleMembers,
  removeRoleMember,
} from '@tuturuuu/internal-api/roles';
import { listWorkspaceMembers } from '@tuturuuu/internal-api/workspaces';
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

type RoleMembersQueryData = {
  data: WorkspaceUser[];
  count: number;
};

function MemberCardSkeleton({ index }: { index: number }) {
  return (
    <div
      key={`member-skeleton-${index}`}
      className="rounded-xl border border-border bg-background p-4"
    >
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 animate-pulse rounded-full bg-foreground/10" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 animate-pulse rounded bg-foreground/10" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}

export default function RoleFormMembersSection({
  wsId,
  roleId,
  initialMembers,
  initialMembersCount,
  form,
  onUpdate,
}: SectionProps & {
  onUpdate: React.Dispatch<React.SetStateAction<number>>;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [addMemberQuery, setAddMemberQuery] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);

  const roleMembersQueryKey = useMemo(
    () => ['workspaces', wsId, 'roles', roleId, 'members'] as const,
    [roleId, wsId]
  );

  const workspaceMembersQuery = useQuery({
    queryKey: ['workspaces', wsId, 'members'],
    queryFn: () => getWorkspaceUsers(wsId),
  });

  const roleMembersQuery = useQuery({
    queryKey: roleMembersQueryKey,
    queryFn: () =>
      roleId ? getRoleMembers(wsId, roleId) : { data: [], count: 0 },
    enabled: !!roleId,
    initialData:
      roleId && initialMembers
        ? {
            data: initialMembers,
            count: initialMembersCount ?? initialMembers.length,
          }
        : undefined,
  });

  const allUsers = workspaceMembersQuery.data?.data || [];
  const roleMembers = roleMembersQuery.data?.data || [];
  const isRefreshingMembers =
    roleMembersQuery.isFetching && roleMembersQuery.fetchStatus !== 'idle';

  useEffect(() => {
    if (roleMembersQuery.isFetched) {
      onUpdate(roleMembersQuery.data?.count || 0);
    }
  }, [roleMembersQuery.data?.count, roleMembersQuery.isFetched, onUpdate]);

  const filteredRoleMembers = useMemo(() => {
    if (!searchQuery) return roleMembers;

    const query = searchQuery.toLowerCase().trim();
    return roleMembers.filter((member) => {
      const name = member.display_name || member.full_name || '';
      return (
        name.toLowerCase().includes(query) ||
        member.full_name?.toLowerCase().includes(query) ||
        member.email?.toLowerCase().includes(query)
      );
    });
  }, [roleMembers, searchQuery]);

  const availableUsers = useMemo(() => {
    const roleMemberIds = new Set(roleMembers.map((member) => member.id));
    const available = allUsers.filter((user) => !roleMemberIds.has(user.id));

    if (!addMemberQuery) return available;

    const query = addMemberQuery.toLowerCase().trim();
    return available.filter((user) => {
      const name = user.display_name || user.full_name || '';
      return (
        name.toLowerCase().includes(query) ||
        user.full_name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query)
      );
    });
  }, [addMemberQuery, allUsers, roleMembers]);

  const handleAddMember = async (memberId: string) => {
    if (!roleId) return;

    try {
      await addRoleMembers(wsId, roleId, [memberId]);
      toast.success(t('ws-roles.member_added_successfully'));
      void roleMembersQuery.refetch();
      setAddMemberQuery('');
    } catch {
      toast.error(t('ws-roles.failed_to_add_member'));
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!roleId) return;

    const previousMembers =
      queryClient.getQueryData<RoleMembersQueryData>(roleMembersQueryKey);
    const removedMember = previousMembers?.data.find(
      (member) => member.id === memberId
    );

    if (removedMember) {
      queryClient.setQueryData<RoleMembersQueryData>(
        roleMembersQueryKey,
        (current) => {
          if (!current) return current;

          const nextData = current.data.filter(
            (member) => member.id !== memberId
          );

          return {
            data: nextData,
            count: Math.max(
              current.count - (current.data.length - nextData.length),
              0
            ),
          };
        }
      );
      onUpdate((count) => Math.max(count - 1, 0));
    }

    try {
      await removeRoleMember(wsId, roleId, memberId);
      toast.success(t('ws-roles.member_removed_successfully'));
      void roleMembersQuery.refetch();
    } catch {
      if (previousMembers) {
        queryClient.setQueryData(roleMembersQueryKey, previousMembers);
        onUpdate(previousMembers.count);
      }
      toast.error(t('ws-roles.failed_to_remove_member'));
    }
  };

  const assignedCount = roleMembers.length;
  const availableCount = availableUsers.length;
  const permissionCount = Object.values(form.watch('permissions') || {}).filter(
    Boolean
  ).length;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="space-y-4 rounded-2xl border border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/5 via-dynamic-blue/10 to-dynamic-purple/5 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-dynamic-blue/20 sm:h-12 sm:w-12">
            <Users className="h-5 w-5 text-dynamic-blue sm:h-6 sm:w-6" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-foreground/60 text-sm">
              {t('ws-roles.managing_members_for')}
            </div>
            <div className="font-bold text-base text-dynamic-blue sm:text-lg">
              {form.watch('name') || t('common.unnamed')}
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isRefreshingMembers ? (
              <LoaderCircle className="h-4 w-4 animate-spin text-foreground/50" />
            ) : null}
            <Badge
              variant="secondary"
              className="h-fit rounded-full px-3 py-1.5 text-sm sm:text-base"
            >
              {assignedCount}{' '}
              {assignedCount === 1
                ? t('ws-roles.member')
                : t('ws-roles.members')}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-background/70 p-3">
            <div className="text-foreground/60 text-xs uppercase tracking-[0.18em]">
              {t('ws-roles.current_members')}
            </div>
            <div className="mt-2 font-semibold text-2xl">{assignedCount}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/70 p-3">
            <div className="text-foreground/60 text-xs uppercase tracking-[0.18em]">
              {t('ws-roles.add_members')}
            </div>
            <div className="mt-2 font-semibold text-2xl">{availableCount}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/70 p-3">
            <div className="text-foreground/60 text-xs uppercase tracking-[0.18em]">
              {t('ws-roles.permissions')}
            </div>
            <div className="mt-2 font-semibold text-2xl">{permissionCount}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-background/40 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <Label className="flex items-center gap-2 font-semibold text-base">
            <UserPlus className="h-4 w-4" />
            {t('ws-roles.add_members')}
          </Label>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void roleMembersQuery.refetch()}
              className="flex-1 sm:flex-none"
            >
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="text-xs sm:text-sm">{t('common.refresh')}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={showAddMembers ? 'outline' : 'secondary'}
              onClick={() => setShowAddMembers(!showAddMembers)}
              className="flex-1 sm:flex-none"
            >
              {showAddMembers ? (
                <>
                  <X className="mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="text-xs sm:text-sm">
                    {t('common.close')}
                  </span>
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="text-xs sm:text-sm">
                    {t('ws-roles.add_member')}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>

        {showAddMembers ? (
          <div className="space-y-3 rounded-xl border bg-background/60 p-3 sm:p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('ws-roles.search_members_to_add_placeholder')}
                value={addMemberQuery}
                onChange={(e) => setAddMemberQuery(e.target.value)}
                className="h-10 pl-9 sm:h-11"
              />
            </div>

            {availableUsers.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center sm:p-8">
                <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground sm:h-10 sm:w-10" />
                <p className="font-medium text-muted-foreground text-sm sm:text-base">
                  {addMemberQuery
                    ? t('ws-roles.no_matching_users_found')
                    : t('ws-roles.all_members_already_added')}
                </p>
              </div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto sm:max-h-80">
                {availableUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex flex-col gap-3 rounded-xl border bg-background p-3 transition-colors hover:bg-accent sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
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
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-sm">
                          {user.display_name ||
                            user.full_name ||
                            t('common.unnamed')}
                        </div>
                        {user.email ? (
                          <div className="truncate text-muted-foreground text-xs sm:text-sm">
                            {user.email}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAddMember(user.id)}
                      className="w-full sm:w-auto"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="text-xs sm:text-sm">
                        {t('common.add')}
                      </span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <Separator />

      <div className="space-y-3 rounded-2xl border border-border bg-background/40 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <Label className="flex items-center gap-2 font-semibold text-base">
            <Users className="h-4 w-4" />
            {t('ws-roles.current_members')} ({filteredRoleMembers.length})
          </Label>
          {roleMembersQuery.isError ? (
            <p className="text-destructive text-xs sm:text-sm">
              {t('ws-roles.failed_to_load_members')}
            </p>
          ) : null}
        </div>

        {roleMembers.length > 0 ? (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('ws-roles.search_current_members_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 pl-9 sm:h-11"
            />
          </div>
        ) : null}

        {roleMembersQuery.isLoading && roleMembers.length === 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <MemberCardSkeleton
                key={`member-skeleton-${index}`}
                index={index}
              />
            ))}
          </div>
        ) : filteredRoleMembers.length > 0 ? (
          <div className="space-y-2">
            {filteredRoleMembers.map((member) => (
              <div
                key={member.id}
                className="flex flex-col gap-3 rounded-xl border bg-background p-3 transition-colors hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar className="h-10 w-10 ring-2 ring-primary/20 sm:h-12 sm:w-12">
                    <AvatarImage src={member.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {member.display_name ? (
                        getInitials(member.display_name)
                      ) : (
                        <User className="h-5 w-5" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-sm sm:text-base">
                      {member.display_name ||
                        member.full_name ||
                        t('common.unnamed')}
                    </div>
                    {member.email ? (
                      <div className="truncate text-muted-foreground text-xs sm:text-sm">
                        {member.email}
                      </div>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => handleRemoveMember(member.id)}
                  className="w-full sm:w-auto"
                >
                  <X className="mr-1 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="text-xs sm:text-sm">
                    {t('common.remove')}
                  </span>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center sm:p-8">
            <Users className="mx-auto mb-2 h-10 w-10 text-muted-foreground sm:mb-3 sm:h-12 sm:w-12" />
            <p className="mb-1 font-semibold text-sm sm:mb-2 sm:text-base">
              {searchQuery
                ? t('ws-roles.no_members_match_search')
                : t('ws-roles.no_members_assigned')}
            </p>
            <p className="text-muted-foreground text-xs sm:text-sm">
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
  const data = (await listWorkspaceMembers(wsId)) as WorkspaceUser[];
  return { data, count: data.length };
}

async function getRoleMembers(wsId: string, roleId: string) {
  return (await listRoleMembers(wsId, roleId)) as RoleMembersQueryData;
}
