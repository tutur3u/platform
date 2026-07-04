'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Filter, Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
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
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useUserStatusLabels } from '@/hooks/use-user-status-labels';
import {
  GroupSectionCard,
  GroupSectionEmpty,
} from './_components/group-section-card';
import GroupMemberActions from './group-member-actions';
import { type GroupMember, GroupMemberCard } from './group-member-card';

interface GroupMembersProps {
  wsId: string;
  groupId: string;
  pageSize: number;
  canViewPersonalInfo: boolean;
  canViewPublicInfo: boolean;
  canUpdateUserGroups: boolean;
  initialData?: { items: GroupMember[]; next?: number };
}

export default function GroupMembers({
  wsId,
  groupId,
  pageSize,
  canViewPersonalInfo,
  canViewPublicInfo,
  canUpdateUserGroups,
  initialData,
}: GroupMembersProps) {
  const t = useTranslations();
  const userStatusLabels = useUserStatusLabels(wsId);

  // React Query hydrated with server-fetched first page (initialData) so the
  // card paints immediately with no on-mount fetch.
  const { data, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: [
        'group-members',
        wsId,
        groupId,
        { canViewPersonalInfo, canViewPublicInfo },
      ],
      queryFn: async ({ pageParam }) => {
        const from = typeof pageParam === 'number' ? pageParam : 0;
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members?offset=${from}&limit=${pageSize}`,
          { cache: 'no-store' }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch group members');
        }

        const payload = (await response.json()) as {
          data?: GroupMember[];
          next?: number;
        };

        return { items: payload.data ?? [], next: payload.next } as {
          items: GroupMember[];
          next?: number;
        };
      },
      getNextPageParam: (lastPage) => lastPage.next,
      initialPageParam: 0,
      initialData: initialData
        ? {
            pages: [{ items: initialData.items, next: initialData.next }],
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
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members/${removeTarget.id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to remove group member');
      }
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

  return (
    <GroupSectionCard
      accent="blue"
      icon={<Users className="h-5 w-5" />}
      title={t('ws-roles.members')}
      description={`${members.length} ${t('ws-roles.members').toLowerCase()}`}
      action={
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
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
      }
    >
      {error instanceof Error ? (
        <GroupSectionEmpty>
          <span className="text-dynamic-red">
            {t('common.error')} {error.message}
          </span>
        </GroupSectionEmpty>
      ) : filteredList.length === 0 ? (
        <GroupSectionEmpty icon={<Users className="h-8 w-8" />}>
          {t('ws-user-group-details.no_members')}
        </GroupSectionEmpty>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {filteredList.map((person) => (
            <GroupMemberCard
              key={person.id}
              person={person}
              wsId={wsId}
              canViewPersonalInfo={canViewPersonalInfo}
              canUpdateUserGroups={canUpdateUserGroups}
              userStatusLabels={userStatusLabels}
              onRemove={setRemoveTarget}
            />
          ))}
        </div>
      )}

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

      {hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outline"
            size="sm"
          >
            <ChevronDown className="h-4 w-4" />
            {isFetchingNextPage ? t('common.loading') : t('common.load_more')}
          </Button>
        </div>
      )}
    </GroupSectionCard>
  );
}
