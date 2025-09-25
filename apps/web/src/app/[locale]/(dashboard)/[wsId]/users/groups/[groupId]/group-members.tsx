'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Button } from '@tuturuuu/ui/button';
import { Avatar, AvatarImage } from '@tuturuuu/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Cake,
  ChevronDown,
  Filter,
  Mail,
  Phone,
  User,
  UserCheck,
  VenusAndMars,
  Ellipsis,
} from '@tuturuuu/ui/icons';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import GroupMemberActions from './group-member-actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';

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
  initialData?: GroupMember[];
  pageSize: number;
}

export default function GroupMembers({
  wsId,
  groupId,
  initialData,
  pageSize,
}: GroupMembersProps) {
  const t = useTranslations();

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
    queryKey: ['group-members', wsId, groupId],
    queryFn: async ({ pageParam }) => {
      const supabase = createClient();
      const from = typeof pageParam === 'number' ? pageParam : 0;
      const to = from + pageSize - 1;

      const { data: groupUsers, error: groupError } = await supabase
        .from('workspace_user_groups_users')
        .select(`
          workspace_users(*),
          role
        `)
        .eq('group_id', groupId)
        .range(from, to);

      if (groupError) throw groupError;
      if (!groupUsers || groupUsers.length === 0)
        return { items: [], next: undefined };

      const membersWithGuestStatus = await Promise.all(
        groupUsers.map(async (user) => {
          const { data: isGuest } = await supabase.rpc('is_user_guest', {
            user_uuid: user.workspace_users.id,
          });

          return {
            ...user.workspace_users,
            role: user.role,
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
    initialData: initialData
      ? {
          pages: [
            {
              items: initialData,
              next: initialData.length < pageSize ? undefined : pageSize,
            },
          ],
          pageParams: [0],
        }
      : undefined,
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
          <GroupMemberActions
            wsId={wsId}
            groupId={groupId}
            memberIds={memberIds}
            managerIds={managerIds}
          />
        </div>
      </div>

      <div className="space-y-2 grid grid-cols-1 md:grid-cols-2 gap-2">
        {filteredList.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
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
                    <Card className="p-3 transition duration-200 hover:border-foreground hover:bg-foreground/5">
                      <CardContent className="p-0">
                        <div className="flex items-center justify-between">
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
                              <div className="font-medium">
                                {person.display_name ||
                                  person.full_name ||
                                  (isManager
                                    ? t('ws-user-group-details.managers')
                                    : t('common.unknown'))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isManager && (
                              <Badge
                                variant="default"
                                className="bg-dynamic-green/10 text-dynamic-green border-dynamic-green/20"
                              >
                                {t('ws-user-group-details.managers')}
                              </Badge>
                            )}
                            {isGuest && (
                              <Badge
                                variant="secondary"
                                className="bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/20"
                              >
                                {t('meet-together.guests')}
                              </Badge>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Ellipsis className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setRemoveTarget(person);
                                  }}
                                >
                                  {t('common.remove')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </HoverCardTrigger>
                <HoverCardContent align="end" className="w-80">
                  <div className="space-y-2">
                    <div className="text-sm flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      <span className="sr-only">
                        {t('settings-account.phone-number')}
                      </span>{' '}
                      <span>
                        {person.phone ||
                          t('ws-user-group-attendance.phone_fallback')}
                      </span>
                    </div>
                    <div className="text-sm flex items-center gap-2">
                      <VenusAndMars className="h-4 w-4" />
                      <span className="sr-only">{t('common.gender')}</span>
                      <span>{person.gender || t('common.unknown')}</span>
                    </div>
                    <div className="text-sm flex items-center gap-2">
                      <Cake className="h-4 w-4" />
                      <span className="sr-only">{t('common.birthday')}</span>
                      <span>
                        {person.birthday
                          ? new Date(person.birthday).toLocaleDateString()
                          : t('common.unknown')}
                      </span>
                    </div>
                    <div className="text-sm flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <span className="sr-only">{t('ws-emails.singular')}</span>
                      <span>{person.email || t('common.unknown')}</span>
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
