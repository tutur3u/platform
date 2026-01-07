'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cake,
  ChevronDown,
  Ellipsis,
  Filter,
  Mail,
  Phone,
  User,
  UserCheck,
  VenusAndMars,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import GroupMemberActions from './group-member-actions';

interface GroupMember extends WorkspaceUser {
  role?: string | null;
  isGuest?: boolean;
  phone?: string | null;
  gender?: string | null;
  birthday?: string | null;
}

interface GroupMembersProps {
  wsId: string;
  groupId: string;
  pageSize: number;
  canViewPersonalInfo: boolean;
  canViewPublicInfo: boolean;
  canUpdateUserGroups: boolean;
}

export default function GroupMembers({
  wsId,
  groupId,
  pageSize,
  canViewPersonalInfo,
  canViewPublicInfo,
  canUpdateUserGroups,
}: GroupMembersProps) {
  const t = useTranslations();
  const { dateTime } = useFormatter();

  // React Query with server-side data hydration
  // initialData comes from server-side fetch in the page component
  // This enables fast initial render with server data, then client-side updates
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      'group-members',
      wsId,
      groupId,
      { canViewPersonalInfo, canViewPublicInfo },
    ],
    queryFn: async ({ pageParam }) => {
      const supabase = createClient();
      const from = typeof pageParam === 'number' ? pageParam : 0;
      const to = from + pageSize - 1;

      const baseFields = 'id, display_name, full_name, avatar_url';
      const publicFields = canViewPublicInfo ? ', birthday, gender' : '';
      const personalFields = canViewPersonalInfo ? ', email, phone' : '';
      const selectQuery = `workspace_users(${baseFields}${publicFields}${personalFields}), role`;

      const { data: groupUsers, error: groupError } = await supabase
        .from('workspace_user_groups_users')
        .select(selectQuery)
        .eq('group_id', groupId)
        .range(from, to);

      if (groupError) throw groupError;
      if (!groupUsers || groupUsers.length === 0)
        return { items: [], next: undefined };

      const membersWithGuestStatus = await Promise.all(
        groupUsers.map(async (user) => {
          const typedUser = user as unknown as {
            workspace_users: WorkspaceUser;
            role: string | null;
          };

          const { data: isGuest } = await supabase.rpc('is_user_guest', {
            user_uuid: typedUser.workspace_users.id,
          });

          return {
            ...typedUser.workspace_users,
            role: typedUser.role,
            isGuest: isGuest || false,
          } as GroupMember;
        })
      );

      const next = groupUsers.length < pageSize ? undefined : to + 1;
      return { items: membersWithGuestStatus, next } as {
        items: GroupMember[];
        next?: number;
      };
    },
    getNextPageParam: (lastPage) => lastPage.next,
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });

  const members = useMemo(
    () => (data ? data.pages.flatMap((p) => p.items) : ([] as GroupMember[])),
    [data]
  );

  const { membersOnly, guestsOnly, managersOnly } = useMemo(() => {
    if (!members) return { membersOnly: [], guestsOnly: [], managersOnly: [] };

    const managersOnly = members.filter((member) => member.role === 'TEACHER');
    const guestsOnly = members.filter(
      (member) => member.isGuest === true && member.role !== 'TEACHER'
    );
    const membersOnly = members.filter(
      (member) => member.role !== 'TEACHER' && !member.isGuest
    );

    return { membersOnly, guestsOnly, managersOnly };
  }, [members]);

  const memberIds = useMemo(
    () => new Set([...membersOnly, ...guestsOnly].map((m) => m.id)),
    [membersOnly, guestsOnly]
  );
  const managerIds = useMemo(
    () => new Set(managersOnly.map((m) => m.id)),
    [managersOnly]
  );

  const [filters, setFilters] = useState({
    members: true,
    guests: true,
    managers: true,
  });

  const allSelected = filters.members && filters.guests && filters.managers;
  const noneSelected = !filters.members && !filters.guests && !filters.managers;

  const filteredList = useMemo(() => {
    if (!members) return [] as GroupMember[];
    if (allSelected || noneSelected) return members;

    return members.filter((m) => {
      const isManager = m.role === 'TEACHER';
      const isGuest = !!m.isGuest && !isManager;
      const isMember = !isManager && !isGuest;

      return (
        (filters.managers && isManager) ||
        (filters.guests && isGuest) ||
        (filters.members && isMember)
      );
    });
  }, [members, filters, allSelected, noneSelected]);

  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const queryClient = useQueryClient();

  const onConfirmRemove = async () => {
    if (!removeTarget) return;
    try {
      setRemoving(true);
      const supabase = createClient();
      const { error } = await supabase
        .from('workspace_user_groups_users')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', removeTarget.id);
      if (error) throw error;
      toast.success(t('common.removed'));
      setRemoveTarget(null);
      await queryClient.invalidateQueries({
        queryKey: ['group-members', wsId, groupId],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast.error(`${t('common.error')} ${msg}`);
    } finally {
      setRemoving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
        <div className="mb-2 font-semibold text-xl">
          {t('ws-roles.members')}
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">{t('common.loading')}</div>
        </div>
      </div>
    );
  }

  if (error instanceof Error) {
    return (
      <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
        <div className="mb-2 font-semibold text-xl">
          {t('ws-roles.members')}
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="text-dynamic-red">
            {t('common.error')} {error.message}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-semibold text-xl">{t('ws-roles.members')}</div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Filter className="h-4 w-4" />
                {t('common.filter')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem
                checked={allSelected}
                onCheckedChange={(checked) => {
                  const value = Boolean(checked);
                  setFilters({
                    members: value,
                    guests: value,
                    managers: value,
                  });
                }}
              >
                {t('common.all')} ({members?.length ?? 0})
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={filters.members}
                onCheckedChange={(checked) =>
                  setFilters((prev) => ({ ...prev, members: Boolean(checked) }))
                }
              >
                {t('ws-roles.members')} ({membersOnly.length})
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={filters.guests}
                onCheckedChange={(checked) =>
                  setFilters((prev) => ({ ...prev, guests: Boolean(checked) }))
                }
              >
                {t('meet-together.guests')} ({guestsOnly.length})
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={filters.managers}
                onCheckedChange={(checked) =>
                  setFilters((prev) => ({
                    ...prev,
                    managers: Boolean(checked),
                  }))
                }
              >
                {t('ws-user-group-details.managers')} ({managersOnly.length})
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canUpdateUserGroups && (
            <GroupMemberActions
              wsId={wsId}
              groupId={groupId}
              memberIds={memberIds}
              managerIds={managerIds}
              canUpdateUserGroups={canUpdateUserGroups}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {filteredList.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {t('ws-user-group-details.no_members')}
          </div>
        ) : (
          filteredList.map((person) => {
            const isManager = person.role === 'TEACHER';
            const isGuest = !!person.isGuest;
            const hasAvatar = Boolean(person.avatar_url);
            return (
              <HoverCard key={person.id}>
                <HoverCardTrigger asChild>
                  <Link href={`/${wsId}/users/database/${person.id}`}>
                    <Card className="relative flex h-full w-full items-center p-3 transition duration-200 hover:border-foreground hover:bg-foreground/5">
                      <CardContent className="p-0">
                        <div className="flex flex-row items-center justify-between pr-12">
                          <div className="flex items-center gap-3">
                            {hasAvatar ? (
                              <Avatar className="h-8 w-8">
                                <AvatarImage
                                  src={person.avatar_url as string}
                                  alt={
                                    person.display_name ||
                                    person.full_name ||
                                    t('avatar')
                                  }
                                />
                              </Avatar>
                            ) : (
                              <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full ${isManager ? 'bg-dynamic-green/10' : 'bg-dynamic-blue/10'}`}
                              >
                                {isManager ? (
                                  <UserCheck
                                    className={`h-4 w-4 ${isManager ? 'text-dynamic-green' : 'text-dynamic-blue'}`}
                                  />
                                ) : (
                                  <User className="h-4 w-4 text-dynamic-blue" />
                                )}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="font-medium">
                                  {person.display_name ||
                                    person.full_name ||
                                    (isManager
                                      ? t('ws-user-group-details.managers')
                                      : t('common.unknown'))}
                                </div>
                                {isManager && (
                                  <Badge
                                    variant="default"
                                    className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green"
                                  >
                                    {t('ws-user-group-details.managers')}
                                  </Badge>
                                )}
                                {isGuest && (
                                  <Badge
                                    variant="secondary"
                                    className="border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange"
                                  >
                                    {t('meet-together.guests')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2" />
                        </div>
                      </CardContent>
                      {/* Ellipsis button pinned to the right side of the card */}
                      <div className="absolute top-1/2 right-2 z-10 -translate-y-1/2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <Ellipsis className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canUpdateUserGroups && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setRemoveTarget(person);
                                }}
                              >
                                {t('common.remove')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  </Link>
                </HoverCardTrigger>
                <HoverCardContent align="end" className="w-80">
                  <div className="space-y-2">
                    {canViewPersonalInfo && (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4" />
                          <span className="sr-only">
                            {t('settings-account.phone-number')}
                          </span>{' '}
                          <span>
                            {person.phone ||
                              t('ws-user-group-attendance.phone_fallback')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4" />
                          <span className="sr-only">
                            {t('ws-emails.singular')}
                          </span>
                          <span>{person.email || t('common.unknown')}</span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <VenusAndMars className="h-4 w-4" />
                      <span className="sr-only">{t('common.gender')}</span>
                      <span>{person.gender || t('common.unknown')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Cake className="h-4 w-4" />
                      <span className="sr-only">{t('common.birthday')}</span>
                      <span>
                        {person.birthday
                          ? dateTime(new Date(person.birthday))
                          : t('common.unknown')}
                      </span>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
            );
          })
        )}
      </div>
      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.confirm')}</DialogTitle>
            <DialogDescription>
              {removeTarget?.role === 'TEACHER' && managersOnly.length === 1
                ? t('ws-user-group-details.confirm_remove_last_manager')
                : t('ws-user-group-details.confirm_remove_member')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onConfirmRemove} disabled={removing}>
              {removing ? t('common.loading') : t('common.remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="mt-3 flex justify-center">
        {hasNextPage && (
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outline"
          >
            <ChevronDown className="h-4 w-4" />
            {isFetchingNextPage ? t('common.loading') : t('common.load_more')}
          </Button>
        )}
      </div>
    </div>
  );
}
