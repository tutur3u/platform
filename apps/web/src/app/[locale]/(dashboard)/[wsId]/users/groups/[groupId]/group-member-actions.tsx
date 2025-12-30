'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Search, UserPlus, X } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Avatar, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface WorkspaceUserLite {
  id: string;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

type ActionType = 'add_members' | 'add_managers';

export interface GroupMemberActionsProps {
  wsId: string;
  groupId: string;
  memberIds: Set<string>; // non-managers
  managerIds: Set<string>;
  canUpdateUserGroups: boolean;
}

export default function GroupMemberActions({
  wsId,
  groupId,
  memberIds,
  managerIds,
  canUpdateUserGroups,
}: GroupMemberActionsProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const { data: allUsers, isLoading } = useQuery({
    queryKey: ['workspace-users-lite', wsId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_users')
        .select('id, display_name, full_name, email, avatar_url')
        .eq('ws_id', wsId)
        .neq('archived', true);
      if (error) throw error;
      return (data ?? []) as WorkspaceUserLite[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const closeDialog = () => {
    setActiveAction(null);
    setSearch('');
    setSelected({});
  };

  const candidateUsers: WorkspaceUserLite[] = useMemo(() => {
    if (!allUsers) return [];
    let pool: WorkspaceUserLite[] = allUsers;
    switch (activeAction) {
      case 'add_members':
        // Show users not already members (members include guests) and not managers
        pool = allUsers.filter(
          (u) => !memberIds.has(u.id) && !managerIds.has(u.id)
        );
        break;
      case 'add_managers':
        // Show users not already managers
        pool = allUsers.filter((u) => !managerIds.has(u.id));
        break;
      default:
        pool = [];
    }
    const bySearch = (() => {
      if (!search) return pool;
      const q = search.toLowerCase();
      return pool.filter(
        (u) =>
          (u.display_name || u.full_name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q)
      );
    })();

    // Exclude currently selected users from the list; no sorting for perf
    const unselected = bySearch.filter((u) => !selected[u.id]);
    return unselected;
  }, [allUsers, activeAction, memberIds, managerIds, search, selected]);

  const toggleSelection = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected]
  );

  const selectedUsers = useMemo(() => {
    if (!allUsers) return [] as WorkspaceUserLite[];
    const set = new Set(selectedIds);
    return allUsers.filter((u) => set.has(u.id));
  }, [allUsers, selectedIds]);

  const onSubmit = async () => {
    if (!activeAction) return;
    try {
      const supabase = createClient();
      if (activeAction === 'add_members') {
        if (selectedIds.length === 0) {
          toast.info(t('common.no-selection'));
          return;
        }
        const { error } = await supabase
          .from('workspace_user_groups_users')
          .insert(
            selectedIds.map((userId) => ({
              user_id: userId,
              group_id: groupId,
              role: 'STUDENT',
            }))
          );
        if (error) throw error;
        toast.success(t('ws-user-group-details.members_added'));
      } else if (activeAction === 'add_managers') {
        if (selectedIds.length === 0) {
          toast.info(t('common.no-selection'));
          return;
        }
        const { error } = await supabase
          .from('workspace_user_groups_users')
          .upsert(
            selectedIds.map((userId) => ({
              user_id: userId,
              group_id: groupId,
              role: 'TEACHER',
            })),
            { onConflict: 'group_id,user_id' }
          );
        if (error) throw error;
        toast.success(t('ws-user-group-details.managers_added'));
      }
      await queryClient.invalidateQueries({
        queryKey: ['group-members', wsId, groupId],
      });
      closeDialog();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast.error(`${t('common.error')}: ${msg}`);
    }
  };

  const actionLabel = (action: ActionType) => {
    switch (action) {
      case 'add_members':
        return t('ws-user-group-details.add_members');
      case 'add_managers':
        return t('ws-user-group-details.add_managers');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            <span>{t('common.manage')}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setActiveAction('add_members');
              if (allUsers) {
                const initial: Record<string, boolean> = {};
                allUsers.forEach((u) => {
                  if (!memberIds.has(u.id) && !managerIds.has(u.id))
                    initial[u.id] = false;
                });
                setSelected(initial);
              }
            }}
            disabled={!canUpdateUserGroups}
          >
            {t('ws-user-group-details.add_members')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setActiveAction('add_managers');
              if (allUsers) {
                const initial: Record<string, boolean> = {};
                allUsers.forEach((u) => {
                  if (!managerIds.has(u.id)) initial[u.id] = false;
                });
                setSelected(initial);
              }
            }}
            disabled={!canUpdateUserGroups}
          >
            {t('ws-user-group-details.add_managers')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={activeAction !== null}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {activeAction ? actionLabel(activeAction) : ''}
            </DialogTitle>
            <DialogDescription>
              {t('ws-user-group-details.select_and_submit', {
                groupActionLabel: activeAction ? actionLabel(activeAction) : '',
              })}
            </DialogDescription>
          </DialogHeader>

          <Accordion type="single" collapsible className="mb-2">
            <AccordionItem value="selected-list">
              <AccordionTrigger>
                {t('common.selected')} ({selectedUsers.length})
              </AccordionTrigger>
              <AccordionContent>
                {selectedUsers.length === 0 ? (
                  <div className="text-muted-foreground text-sm">
                    {t('ws-user-group-details.no_users_selected')}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedUsers.map((u) => {
                      const name =
                        u.display_name || u.full_name || u.email || '—';
                      return (
                        <div
                          key={u.id}
                          className="flex items-center justify-between rounded-md border px-2 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {u.avatar_url ? (
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={u.avatar_url} alt={name} />
                              </Avatar>
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-dynamic-blue/10" />
                            )}
                            <span className="truncate text-sm">{name}</span>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() =>
                              setSelected((prev) => ({
                                ...prev,
                                [u.id]: false,
                              }))
                            }
                            aria-label={`Remove ${name}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('ws-user-group-details.search_users_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="rounded-md border">
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : (
              <ScrollArea className="h-72">
                <div className="space-y-2 p-2">
                  {candidateUsers.length === 0 ? (
                    <div className="py-6 text-center text-muted-foreground">
                      {t('common.no-results')}
                    </div>
                  ) : (
                    candidateUsers.map((u) => {
                      const name =
                        u.display_name || u.full_name || u.email || '—';
                      const inMembers = memberIds.has(u.id);
                      const inManagers = managerIds.has(u.id);
                      return (
                        <button
                          type="button"
                          key={u.id}
                          className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:cursor-pointer hover:bg-foreground/5"
                          onClick={() => toggleSelection(u.id)}
                        >
                          <div className="flex items-center gap-3">
                            {u.avatar_url ? (
                              <Avatar className="h-7 w-7">
                                <AvatarImage src={u.avatar_url} alt={name} />
                              </Avatar>
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-dynamic-blue/10" />
                            )}
                            <div className="flex items-center gap-2">
                              <div className="font-medium text-sm">{name}</div>
                              {inManagers && (
                                <Badge className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green">
                                  {t('ws-user-group-details.manager')}
                                </Badge>
                              )}
                              {inMembers && !inManagers && (
                                <Badge
                                  variant="secondary"
                                  className="border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue"
                                >
                                  {t('ws-user-group-details.member')}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Checkbox
                            checked={!!selected[u.id]}
                            onCheckedChange={() => toggleSelection(u.id)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          />
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onSubmit}>{t('common.submit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
