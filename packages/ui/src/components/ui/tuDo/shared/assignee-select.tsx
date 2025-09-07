'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  ChevronsUpDown,
  Crown,
  Loader2,
  UserPlus,
  Users,
} from '@tuturuuu/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useParams } from 'next/navigation';
import { useState } from 'react';

interface Member {
  id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
  role?: string;
  role_title?: string;
}

interface Task {
  id: string;
  assignees?: Member[];
}

interface Props {
  taskId: string;
  assignees?: Member[];
  onUpdate?: () => void;
}

export function AssigneeSelect({ taskId, assignees = [], onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const params = useParams();
  const wsId = params.wsId as string;
  const boardId = params.boardId as string;
  const queryClient = useQueryClient();

  // Deduplicate assignees by ID using O(n) Map approach
  const uniqueAssignees = Array.from(
    assignees
      .reduce((map, assignee) => {
        if (assignee?.id) {
          map.set(assignee.id, assignee);
        }
        return map;
      }, new Map())
      .values()
  );

  // Fetch workspace members with React Query
  const { data: members = [], isLoading: isFetchingMembers } = useQuery({
    queryKey: ['workspace-members', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${wsId}/members`);
      if (!response.ok) throw new Error('Failed to fetch members');

      const { members: fetchedMembers } = await response.json();

      // Deduplicate members by ID using O(n) Map approach
      const uniqueMembers = Array.from(
        fetchedMembers
          .reduce((map: Map<string, Member>, member: Member) => {
            if (member.id) {
              map.set(member.id, member);
            }
            return map;
          }, new Map<string, Member>())
          .values()
      );

      return uniqueMembers as Member[];
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation for updating task assignees
  const assigneeMutation = useMutation({
    mutationFn: async ({
      memberId,
      action,
    }: {
      memberId: string;
      action: 'add' | 'remove';
    }) => {
      const supabase = createClient();

      if (action === 'remove') {
        const { error } = await supabase
          .from('task_assignees')
          .delete()
          .eq('task_id', taskId)
          .eq('user_id', memberId);

        if (error) {
          console.error('Remove assignee error:', error);
          throw new Error(error.message || 'Failed to remove assignee');
        }
      } else {
        const { error } = await supabase.from('task_assignees').insert({
          task_id: taskId,
          user_id: memberId,
        });

        if (error) {
          console.error('Add assignee error:', error);
          throw new Error(error.message || 'Failed to add assignee');
        }
      }

      return { memberId, action };
    },
    onMutate: async ({ memberId, action }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      // Optimistically update the cache
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;

          return old.map((task: Task) => {
            if (task.id !== taskId) return task;

            const currentAssignees = task.assignees || [];
            let newAssignees: Member[];

            if (action === 'add') {
              const member = members.find((m) => m.id === memberId);
              if (
                member &&
                !currentAssignees.some((a: Member) => a.id === memberId)
              ) {
                newAssignees = [...currentAssignees, member];
              } else {
                newAssignees = currentAssignees;
              }
            } else {
              newAssignees = currentAssignees.filter(
                (a: Member) => a.id !== memberId
              );
            }

            return { ...task, assignees: newAssignees };
          });
        }
      );

      return { previousTasks };
    },
    onError: (err, _, context) => {
      // Rollback optimistic update on error
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Failed to update task assignees:', err);
      toast({
        title: 'Error',
        description: `Failed to update assignees: ${errorMessage}`,
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      // Invalidate and refetch tasks to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      onUpdate?.();
    },
    onSettled: () => {
      setOpen(false);
    },
  });

  const handleSelect = async (memberId: string) => {
    const isAssigned = uniqueAssignees.some(
      (assignee) => assignee.id === memberId
    );

    assigneeMutation.mutate({
      memberId,
      action: isAssigned ? 'remove' : 'add',
    });
  };

  // Filter assigned and unassigned members with additional safety checks
  const assignedMembers = members.filter(
    (member) =>
      member?.id &&
      uniqueAssignees.some((assignee) => assignee?.id === member.id)
  );

  const unassignedMembers = members.filter(
    (member) =>
      member?.id &&
      !uniqueAssignees.some((assignee) => assignee?.id === member.id)
  );

  // Additional deduplication using O(n) Map approach
  const uniqueAssignedMembers = Array.from(
    assignedMembers
      .reduce((map: Map<string, Member>, member: Member) => {
        if (member.id) {
          map.set(member.id, member);
        }
        return map;
      }, new Map<string, Member>())
      .values()
  );

  const uniqueUnassignedMembers = Array.from(
    unassignedMembers
      .reduce((map: Map<string, Member>, member: Member) => {
        if (member.id) {
          map.set(member.id, member);
        }
        return map;
      }, new Map<string, Member>())
      .values()
  );

  const getRoleColor = (role?: string) => {
    switch (role?.toLowerCase()) {
      case 'owner':
      case 'admin':
        return 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 dark:from-amber-900/30 dark:to-orange-900/30 dark:text-amber-300';
      case 'manager':
        return 'bg-gradient-to-r from-purple-100 to-pink-100 text-purple-800 dark:from-purple-900/30 dark:to-pink-900/30 dark:text-purple-300';
      default:
        return 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 dark:from-blue-900/30 dark:to-indigo-900/30 dark:text-blue-300';
    }
  };

  const getRoleIcon = (role?: string) => {
    if (role?.toLowerCase() === 'owner' || role?.toLowerCase() === 'admin') {
      return <Crown className="h-3 w-3" />;
    }
    return null;
  };

  const isLoading = isFetchingMembers || assigneeMutation.isPending;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-expanded={open}
          disabled={isLoading}
          className={cn(
            'h-6 justify-start px-0.5 py-0.5 text-[10px] transition-all duration-200',
            'hover:bg-gray-100 dark:hover:bg-gray-800',
            'border border-transparent hover:border-gray-300 dark:hover:border-gray-600',
            'min-w-0 rounded-lg'
          )}
        >
          {uniqueAssignees.length > 0 ? (
            <div className="flex min-w-0 items-center gap-x-0.5">
              <div className="-space-x-1.5 flex">
                {uniqueAssignees.slice(0, 2).map((assignee) => (
                  <Avatar
                    key={assignee.id}
                    className="h-4 w-4 border border-background shadow-sm"
                  >
                    <AvatarImage src={assignee.avatar_url} />
                    <AvatarFallback className="bg-gradient-to-br from-blue-100 to-indigo-100 text-[8px] text-blue-700 dark:from-blue-900 dark:to-indigo-900 dark:text-blue-300">
                      {assignee.display_name?.[0] || assignee.email?.[0] || '?'}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              {uniqueAssignees.length > 2 && (
                <span className="font-medium text-[10px] text-gray-600 dark:text-gray-400">
                  +{uniqueAssignees.length - 2}
                </span>
              )}
              <span className="truncate text-[10px] text-gray-600 dark:text-gray-400">
                {uniqueAssignees.length === 1
                  ? uniqueAssignees[0]?.display_name ||
                    uniqueAssignees[0]?.email?.split('@')[0] ||
                    'User'
                  : `${uniqueAssignees.length} assigned`}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-x-0.5 text-gray-500 dark:text-gray-400">
              <Users className="h-3 w-3" />
              <span className="text-[10px]">Assign</span>
            </div>
          )}
          {isLoading ? (
            <Loader2 className="ml-1 h-2 w-2 animate-spin text-gray-500" />
          ) : (
            (open || uniqueAssignees.length !== 1) && (
              <ChevronsUpDown
                className={cn(
                  'ml-1 h-2 w-2 shrink-0 opacity-50 transition-all duration-200',
                  'group-hover:opacity-100'
                )}
              />
            )
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 border-0 bg-white/95 p-0 shadow-2xl backdrop-blur-sm dark:bg-gray-900/95"
        align="start"
        side="bottom"
      >
        <div className="/50 overflow-hidden rounded-xl border dark:border-gray-700/50">
          <Command>
            <div className="border-gray-100 border-b bg-gradient-to-r from-gray-50 to-slate-50 dark:border-gray-800 dark:from-gray-900 dark:to-slate-900">
              <CommandInput
                placeholder="Search workspace members..."
                value={searchQuery}
                onValueChange={setSearchQuery}
                className="border-0 bg-transparent text-sm focus:ring-0"
              />
            </div>
            <CommandList className="max-h-72">
              <CommandEmpty className="py-6 text-center text-muted-foreground text-sm">
                <UserPlus className="mx-auto mb-2 h-8 w-8 opacity-50" />
                No members found.
              </CommandEmpty>
              {uniqueAssignedMembers.length > 0 && (
                <CommandGroup
                  heading="Assigned"
                  className="bg-gradient-to-r from-green-50 to-emerald-50 px-2 py-2 font-semibold text-green-700 text-xs dark:from-green-950/20 dark:to-emerald-950/20 dark:text-green-400"
                >
                  {uniqueAssignedMembers.map((member) => (
                    <CommandItem
                      key={member.id}
                      value={`${member.display_name} ${member.email}`}
                      onSelect={() => handleSelect(member.id)}
                      disabled={assigneeMutation.isPending}
                      className="mx-1 my-1 gap-3 rounded-lg px-3 py-3 transition-all duration-200 hover:bg-gradient-to-r hover:from-green-100 hover:to-emerald-100 disabled:opacity-50 dark:hover:from-green-900/20 dark:hover:to-emerald-900/20"
                    >
                      <Avatar className="h-8 w-8 shadow-sm ring-2 ring-green-200 dark:ring-green-800">
                        <AvatarImage src={member.avatar_url} />
                        <AvatarFallback className="bg-gradient-to-br from-green-100 to-emerald-100 text-green-700 dark:from-green-900 dark:to-emerald-900 dark:text-green-300">
                          {member.display_name?.[0] || member.email?.[0] || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-gray-900 text-sm dark:text-gray-100">
                          {member.display_name || member.email}
                        </div>
                        {member.role_title && (
                          <div className="mt-1 flex items-center gap-1.5">
                            {getRoleIcon(member.role)}
                            <Badge
                              variant="outline"
                              className={cn(
                                'h-5 border-0 px-2 font-medium text-[10px]',
                                getRoleColor(member.role)
                              )}
                            >
                              {member.role_title}
                            </Badge>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-green-500"></div>
                        <span className="text-green-600 text-xs dark:text-green-400">
                          Assigned
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {uniqueUnassignedMembers.length > 0 && (
                <CommandGroup
                  heading="Available Members"
                  className="bg-gradient-to-r from-blue-50 to-indigo-50 px-2 py-2 font-semibold text-blue-700 text-xs dark:from-blue-950/20 dark:to-indigo-950/20 dark:text-blue-400"
                >
                  {uniqueUnassignedMembers.map((member) => (
                    <CommandItem
                      key={member.id}
                      value={`${member.display_name} ${member.email}`}
                      onSelect={() => handleSelect(member.id)}
                      disabled={assigneeMutation.isPending}
                      className="mx-1 my-1 gap-3 rounded-lg px-3 py-3 transition-all duration-200 hover:bg-gradient-to-r hover:from-blue-100 hover:to-indigo-100 disabled:opacity-50 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20"
                    >
                      <Avatar className="h-8 w-8 shadow-sm ring-2 ring-blue-200 dark:ring-blue-800">
                        <AvatarImage src={member.avatar_url} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 dark:from-blue-900 dark:to-indigo-900 dark:text-blue-300">
                          {member.display_name?.[0] || member.email?.[0] || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-gray-900 text-sm dark:text-gray-100">
                          {member.display_name || member.email}
                        </div>
                        {member.role_title && (
                          <div className="mt-1 flex items-center gap-1.5">
                            {getRoleIcon(member.role)}
                            <Badge
                              variant="outline"
                              className={cn(
                                'h-5 border-0 px-2 font-medium text-[10px]',
                                getRoleColor(member.role)
                              )}
                            >
                              {member.role_title}
                            </Badge>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                        <span className="text-gray-500 text-xs dark:text-gray-400">
                          Available
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      </PopoverContent>
    </Popover>
  );
}
