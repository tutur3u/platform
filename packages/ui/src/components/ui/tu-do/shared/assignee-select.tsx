'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserCircle, UserMinus, UserPlus, X } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useParams } from 'next/navigation';
import { forwardRef, useImperativeHandle, useState } from 'react';

interface Member {
  id: string;
  user_id?: string; // For consistency with task creation flow
  display_name?: string;
  email?: string;
  avatar_url?: string;
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

export interface AssigneeSelectHandle {
  open: () => void;
  close: () => void;
}

export const AssigneeSelect = forwardRef<AssigneeSelectHandle, Props>(
  ({ taskId, assignees = [] }, ref) => {
    const [open, setOpen] = useState(false);

    // Expose open/close methods via ref
    useImperativeHandle(ref, () => ({
      open: () => setOpen(true),
      close: () => setOpen(false),
    }));
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
        }, new Map<string, Member>())
        .values()
    );

    // Fetch workspace members with React Query
    const {
      data: members = [],
      isLoading: isFetchingMembers,
      error: membersError,
    } = useQuery<Member[]>({
      queryKey: ['workspace-members', wsId],
      queryFn: async (): Promise<Member[]> => {
        const response = await fetch(`/api/workspaces/${wsId}/members`);
        if (!response.ok) {
          throw new Error('Failed to fetch members');
        }

        const { members: fetchedMembers } = (await response.json()) as {
          members: Member[];
        };

        // Deduplicate members by ID using O(n) Map approach
        // Also ensure user_id is set for consistency with task creation flow
        const uniqueMembers: Member[] = Array.from(
          fetchedMembers
            .reduce((map, member) => {
              if (member.id) {
                map.set(member.id, {
                  ...member,
                  user_id: member.user_id || member.id, // Ensure user_id is set
                });
              }
              return map;
            }, new Map<string, Member>())
            .values()
        );

        return uniqueMembers;
      },
    });

    // Handle fetch errors
    if (membersError) {
      const errorMessage =
        membersError instanceof Error
          ? membersError.message
          : 'Failed to get workspace members';
      toast.error(errorMessage);
    }

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
          const { error } = await supabase.from('task_assignees').upsert(
            {
              task_id: taskId,
              user_id: memberId,
            },
            {
              onConflict: 'task_id,user_id',
              ignoreDuplicates: true,
            }
          );

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
        toast('Error', {
          description: `Failed to update assignees: ${errorMessage}`,
        });
      },
      // Note: Removed onSettled invalidation to prevent flicker
      // Optimistic updates handle immediate UI feedback
      // Realtime subscription handles cross-user sync
    });

    const handleSelect = (memberId: string) => {
      const isAssigned = uniqueAssignees.some(
        (assignee) => assignee.id === memberId
      );

      assigneeMutation.mutate({
        memberId,
        action: isAssigned ? 'remove' : 'add',
      });
    };

    const handleRemoveAll = async () => {
      // Remove all assignees sequentially to avoid race conditions
      for (const assignee of uniqueAssignees) {
        await assigneeMutation.mutateAsync({
          memberId: assignee.id,
          action: 'remove',
        });
      }
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

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="link"
            aria-expanded={open}
            disabled={isFetchingMembers}
            size="xs"
            className={cn(
              'items-start justify-start transition-opacity duration-200',
              assigneeMutation.isPending && 'opacity-50'
            )}
            onClick={(e) => {
              e.stopPropagation(); // Always prevent event propagation to task card
              // Prevent popover from opening when shift is held down
              // (user might be about to select multiple tasks for bulk action)
              if (e.shiftKey) {
                e.preventDefault();
              }
            }}
          >
            {uniqueAssignees.length > 0 ? (
              <div className="flex min-w-0 items-center gap-1">
                <div className="flex items-center gap-1 -space-x-3">
                  {uniqueAssignees.slice(0, 4).map((assignee) => (
                    <div
                      key={assignee.id}
                      className="group/assignee relative flex items-center"
                    >
                      <Avatar className="h-4 w-4 border border-background shadow-sm">
                        <AvatarImage src={assignee.avatar_url} />
                        <AvatarFallback className="bg-muted font-semibold text-[9px]">
                          {assignee.display_name?.[0] ||
                            assignee.email?.[0] ||
                            '?'}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-muted-foreground">
                <UserCircle className="h-4 w-4" />
              </div>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 border p-3 shadow-lg"
          align="start"
          side="bottom"
          onClick={(e) => {
            e.stopPropagation(); // Prevent triggering task card click
          }}
        >
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 border-0 bg-muted/50 pl-9 text-sm focus-visible:ring-0"
              />
            </div>
            <div
              className={cn(
                'space-y-3 transition-opacity duration-200',
                assigneeMutation.isPending && 'pointer-events-none opacity-50'
              )}
            >
              {/* Selected Assignees */}
              {uniqueAssignedMembers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                    Assigned ({uniqueAssignedMembers.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {uniqueAssignedMembers.map((member) => (
                      <Button
                        key={member.id}
                        type="button"
                        variant="default"
                        size="xs"
                        onClick={() => handleSelect(member.id)}
                        className="h-7 gap-1.5 rounded-full border border-dynamic-orange/30 bg-dynamic-orange/15 px-3 font-medium text-dynamic-orange text-xs shadow-sm transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/25"
                      >
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={member.avatar_url} />
                          <AvatarFallback className="bg-dynamic-orange/20 font-bold text-[9px]">
                            {member.display_name?.[0] ||
                              member.email?.[0] ||
                              '?'}
                          </AvatarFallback>
                        </Avatar>
                        {member.display_name || member.email}
                        <X className="h-3 w-3 opacity-70" />
                      </Button>
                    ))}
                  </div>
                  {uniqueAssignedMembers.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleRemoveAll}
                      className="mt-1 h-6 w-full text-dynamic-red text-xs hover:bg-dynamic-red/10 hover:text-dynamic-red"
                    >
                      <UserMinus className="mr-1 h-3 w-3" />
                      Remove all
                    </Button>
                  )}
                </div>
              )}

              {/* Available Members */}
              <div className="space-y-1.5">
                {(() => {
                  const filteredMembers = uniqueUnassignedMembers.filter(
                    (member) =>
                      !searchQuery ||
                      (member.display_name || '')
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase()) ||
                      (member.email || '')
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase())
                  );

                  if (filteredMembers.length === 0) {
                    return searchQuery ? (
                      <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-muted/30 py-6">
                        <UserPlus className="h-4 w-4 text-muted-foreground/40" />
                        <p className="text-center text-muted-foreground text-xs">
                          No members found
                        </p>
                      </div>
                    ) : uniqueAssignedMembers.length > 0 ? (
                      <div className="rounded-lg bg-muted/30 py-3 text-center">
                        <p className="text-muted-foreground text-xs">
                          All members assigned
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-muted/30 py-3 text-center">
                        <p className="text-muted-foreground text-xs">
                          No members available
                        </p>
                      </div>
                    );
                  }

                  return (
                    <>
                      <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                        Available ({filteredMembers.length})
                      </p>
                      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                        {filteredMembers.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => handleSelect(member.id)}
                            className="group flex items-center gap-2.5 rounded-md border border-transparent bg-background/50 px-3 py-2 text-left transition-all hover:border-dynamic-orange/30 hover:bg-dynamic-orange/5"
                          >
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarImage src={member.avatar_url} />
                              <AvatarFallback className="bg-muted font-semibold text-muted-foreground text-xs group-hover:bg-dynamic-orange/20 group-hover:text-dynamic-orange">
                                {member.display_name?.[0] ||
                                  member.email?.[0] ||
                                  '?'}
                              </AvatarFallback>
                            </Avatar>
                            <span className="flex-1 truncate text-sm">
                              {member.display_name || member.email}
                            </span>
                            <UserPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);

AssigneeSelect.displayName = 'AssigneeSelect';
