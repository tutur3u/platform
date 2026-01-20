import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useEffect } from 'react';
import { useCallbackRef } from './use-callback-ref';
import { useStableArray } from './use-stable-array';

export function useBoardRealtime(
  boardId: string,
  taskIds: string[],
  listIds: string[],
  options: {
    enabled?: boolean;
    onTaskChange?: (
      task: Task,
      eventType: 'INSERT' | 'UPDATE' | 'DELETE'
    ) => void;
    onListChange?: (
      list: TaskList,
      eventType: 'INSERT' | 'UPDATE' | 'DELETE'
    ) => void;
  }
) {
  const { enabled = true, onTaskChange, onListChange } = options;
  const queryClient = useQueryClient();

  const stableTaskIds = useStableArray(taskIds);
  const stableListIds = useStableArray(listIds);

  // Create stable callback functions
  const handleTaskChange = useCallbackRef(
    (task: Task, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      onTaskChange?.(task, eventType);
    }
  );

  const handleListChange = useCallbackRef(
    (list: TaskList, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => {
      onListChange?.(list, eventType);
    }
  );

  useEffect(() => {
    if (!boardId || !enabled) return;

    const supabase = createClient();
    const channel = supabase.channel(`board-realtime-${boardId}`);

    /**
     * Helper function to fetch updated relations for a specific task
     * and update just that task in the cache (avoiding full refetch flicker)
     */
    const fetchAndUpdateTaskRelations = async (taskId: string) => {
      try {
        // Fetch updated relations for this specific task
        const { data: taskData, error } = await supabase
          .from('tasks')
          .select(
            `
            id,
            assignees:task_assignees(
              user:users(
                id,
                display_name,
                avatar_url
              )
            ),
            labels:task_labels(
              label:workspace_task_labels(
                id,
                name,
                color,
                created_at
              )
            ),
            projects:task_project_tasks(
              project:task_projects(
                id,
                name,
                status
              )
            )
          `
          )
          .eq('id', taskId)
          .single();

        if (error || !taskData) {
          if (DEV_MODE) {
            console.error('Failed to fetch task relations:', error);
          }
          return;
        }

        // Transform the nested structure to flat arrays
        const transformedRelations = {
          assignees:
            taskData.assignees
              ?.map((a: { user: unknown }) => a.user)
              .filter(Boolean) || [],
          labels:
            taskData.labels
              ?.map((l: { label: unknown }) => l.label)
              .filter(Boolean) || [],
          projects:
            taskData.projects
              ?.map((p: { project: unknown }) => p.project)
              .filter(Boolean) || [],
        };

        // Update just this task in the cache
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (task.id !== taskId) return task;
              return {
                ...task,
                ...transformedRelations,
              };
            });
          }
        );
      } catch (err) {
        if (DEV_MODE) {
          console.error('Error updating task relations:', err);
        }
      }
    };

    /**
     * Helper function to set up a realtime listener for task-related tables.
     * When relations change (assignees, labels, projects), we fetch updated
     * relations for just that task and merge into cache (no full refetch).
     */
    const setupTaskRelationListener = (tableName: string, _comment: string) => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
        },
        async (payload) => {
          // Only process if the task belongs to one of our lists
          const newRecord = payload.new as { task_id?: string } | undefined;
          const oldRecord = payload.old as { task_id?: string } | undefined;
          const taskId = newRecord?.task_id || oldRecord?.task_id;
          if (taskId && stableTaskIds.includes(taskId)) {
            // Fetch and update just this task's relations
            await fetchAndUpdateTaskRelations(taskId);
          }
        }
      );
    };

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'task_lists',
        filter: `board_id=eq.${boardId}`,
      },
      (payload) => {
        const { eventType, old: oldRecord, new: newRecord } = payload;

        if (oldRecord || newRecord) {
          handleListChange((oldRecord || newRecord) as TaskList, eventType);
        }

        // Handle realtime list changes with setQueryData (avoids flicker)
        // Task changes come through the tasks listener, not here
        switch (eventType) {
          case 'INSERT': {
            queryClient.setQueryData(
              ['task_lists', boardId],
              (old: TaskList[] | undefined) => {
                const insertedList = newRecord as TaskList & {
                  list_id?: string;
                };
                // CRITICAL FIX: The realtime subscription sometimes sends TASK data
                // to the task_lists listener. Tasks have a `list_id` property that
                // points to their parent task_list, but task_lists don't have this.
                // If we see `list_id`, this is actually a task, not a task_list!
                if (insertedList?.list_id) {
                  console.warn(
                    '[useBoardRealtime] Skipping task data in task_lists INSERT (has list_id):',
                    { id: insertedList.id, list_id: insertedList.list_id }
                  );
                  return old ?? [];
                }
                // Validate that the record has required fields
                if (!insertedList?.id || !insertedList?.board_id) {
                  console.warn(
                    '[useBoardRealtime] Skipping invalid task_lists INSERT:',
                    insertedList
                  );
                  return old ?? [];
                }
                if (!old) return [insertedList];
                // Check if already exists (from optimistic update)
                if (old.some((l) => l.id === insertedList.id)) return old;
                return [...old, insertedList];
              }
            );
            break;
          }

          case 'UPDATE':
            queryClient.setQueryData(
              ['task_lists', boardId],
              (old: TaskList[] | undefined) => {
                if (!old) return old;
                const updatedList = newRecord as TaskList;
                return old.map((list) =>
                  list.id === updatedList.id
                    ? { ...list, ...updatedList }
                    : list
                );
              }
            );
            break;

          case 'DELETE':
            queryClient.setQueryData(
              ['task_lists', boardId],
              (old: TaskList[] | undefined) => {
                if (!old) return old;
                const deletedList = oldRecord as TaskList;
                return old.filter((list) => list.id !== deletedList.id);
              }
            );
            // Also remove tasks from deleted list
            queryClient.setQueryData(
              ['tasks', boardId],
              (old: Task[] | undefined) => {
                if (!old) return old;
                const deletedList = oldRecord as TaskList;
                return old.filter((task) => task.list_id !== deletedList.id);
              }
            );
            break;
        }
      }
    );

    if (stableListIds.length > 0) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `list_id=in.(${stableListIds.join(',')})`,
        },
        async (payload) => {
          const { eventType, old: oldRecord, new: newRecord } = payload;

          // Call custom callback if provided
          if (oldRecord || newRecord) {
            handleTaskChange((oldRecord || newRecord) as Task, eventType);
          }

          // Handle realtime events with care to preserve joined data
          switch (eventType) {
            case 'INSERT':
              // When a new task is inserted, we need to fetch its relations
              // The raw INSERT payload only contains task columns, not joined data
              queryClient.setQueryData(
                ['tasks', boardId],
                (old: Task[] | undefined) => {
                  const insertedTask = newRecord as Task;
                  if (!old) {
                    // Initialize with empty relations - will be populated by relation listeners
                    return [
                      {
                        ...insertedTask,
                        assignees: [],
                        labels: [],
                        projects: [],
                      },
                    ];
                  }
                  const existingTask = old.find(
                    (t) => t.id === insertedTask.id
                  );
                  if (existingTask) {
                    // Task already exists (likely added by optimistic update)
                    // Remove _isOptimistic flag to confirm the task and enable full interaction
                    if ('_isOptimistic' in existingTask) {
                      return old.map((t) =>
                        t.id === insertedTask.id
                          ? { ...t, _isOptimistic: undefined }
                          : t
                      );
                    }
                    // Task already confirmed, keep as is
                    return old;
                  }
                  // New task from realtime - add with empty relations
                  // Relations will be updated by subsequent relation listener events
                  return [
                    ...old,
                    {
                      ...insertedTask,
                      assignees: [],
                      labels: [],
                      projects: [],
                    },
                  ];
                }
              );

              // Fetch and update the task's relations after a small delay
              // to allow any relation inserts to complete first
              setTimeout(() => {
                if (newRecord?.id) {
                  fetchAndUpdateTaskRelations(newRecord.id as string);
                }
              }, 100);
              break;

            case 'UPDATE':
              // Update scalar fields from DB
              queryClient.setQueryData(
                ['tasks', boardId],
                (old: Task[] | undefined) => {
                  if (!old) return old;
                  const updatedRecord = newRecord as Task;

                  // Handle soft delete - if deleted_at is set, remove from cache
                  if (updatedRecord.deleted_at) {
                    return old.filter((task) => task.id !== updatedRecord.id);
                  }

                  return old.map((task) => {
                    if (task.id !== updatedRecord.id) return task;
                    return { ...task, ...updatedRecord };
                  });
                }
              );
              break;

            case 'DELETE':
              queryClient.setQueryData(
                ['tasks', boardId],
                (old: Task[] | undefined) => {
                  if (!old) return old;
                  return old.filter((task) => task.id !== oldRecord.id);
                }
              );
              break;
          }
        }
      );
    }
    // Set up listeners for task-related tables using helper function
    // NOTE: These listeners fetch updated relations for the specific task and merge
    // into cache, avoiding full refetch which would cause UI flicker.
    setupTaskRelationListener(
      'task_assignees',
      'task assignees (catches all tasks including newly created ones)'
    );
    setupTaskRelationListener(
      'task_labels',
      'task labels (catches all tasks including newly created ones)'
    );
    setupTaskRelationListener(
      'task_project_tasks',
      'task project assignments (catches all tasks including newly created ones)'
    );

    // Listen for changes to workspace labels (affects all tasks in the workspace)
    // Note: workspace_task_labels has ws_id, not task_id
    // - INSERT: New labels don't affect existing tasks (task_labels listener handles linking)
    // - UPDATE: Label name/color changes affect all tasks using this label → invalidate
    // - DELETE: Label removal is handled by task_labels listener
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE', // Only listen for UPDATE events (name/color changes)
        schema: 'public',
        table: 'workspace_task_labels',
      },
      async (payload) => {
        const newRecord = payload.new as { id?: string } | undefined;
        const labelId = newRecord?.id;

        if (!labelId) return;

        const { data: linkedTasks, error } = await supabase
          .from('task_labels')
          .select('task_id')
          .eq('label_id', labelId);

        if (error) {
          if (DEV_MODE) {
            console.error(
              'Failed to fetch task_labels for workspace label:',
              error
            );
          }
          return;
        }

        if (
          linkedTasks?.some(
            ({ task_id }) => task_id && stableTaskIds.includes(task_id)
          )
        ) {
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
        }
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    boardId,
    enabled,
    stableTaskIds,
    stableListIds,
    queryClient,
    handleTaskChange,
    handleListChange,
  ]);
}
