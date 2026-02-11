import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useCallback, useEffect, useRef } from 'react';
import type { BoardBroadcastFn } from '../components/ui/tu-do/shared/board-broadcast-context';

export function useBoardRealtime(
  boardId: string,
  options?: {
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
): { broadcast: BoardBroadcastFn } {
  const { enabled = true, onTaskChange, onListChange } = options ?? {};
  const queryClient = useQueryClient();

  // Hold channel ref so the returned broadcast fn always targets the current channel
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>['channel']
  > | null>(null);

  // Deferred cleanup timer — prevents StrictMode "leave then immediate rejoin"
  // race that kills the subscription on the Supabase Realtime server.
  const destroyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store callbacks in refs so they don't cause channel re-creation when
  // consumers pass non-memoized functions.
  const onTaskChangeRef = useRef(onTaskChange);
  onTaskChangeRef.current = onTaskChange;
  const onListChangeRef = useRef(onListChange);
  onListChangeRef.current = onListChange;

  // ── Sender-side broadcast batching ──────────────────────────────
  // Buffers rapid-fire broadcast calls (e.g. bulk operations) over a
  // 50ms window, then flushes them as deduplicated messages.
  const batchBufferRef = useRef<Map<string, Record<string, unknown>[]>>(
    new Map()
  );
  const batchFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Receiver-side relations batching ────────────────────────────
  // Collects task IDs from task:relations-changed events over 150ms
  // and batch-fetches all relations in one query.
  const pendingRelationIdsRef = useRef<Set<string>>(new Set());
  const relationFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    if (!boardId || !enabled) return;

    // ── StrictMode reuse path ──────────────────────────────────────
    // If a pending deferred destruction exists, cancel it and reuse
    // the existing channel. This prevents the Supabase Realtime
    // "leave then immediate re-join" race that causes a dead channel.
    if (destroyTimerRef.current) {
      clearTimeout(destroyTimerRef.current);
      destroyTimerRef.current = null;

      if (channelRef.current) {
        if (DEV_MODE) {
          console.log(
            `[useBoardRealtime] Reusing channel for board ${boardId} (StrictMode)`
          );
        }
        // Return a new deferred cleanup for this mount cycle
        return () => {
          const channel = channelRef.current;
          destroyTimerRef.current = setTimeout(() => {
            destroyTimerRef.current = null;
            if (channel && channelRef.current === channel) {
              channelRef.current = null;
              createClient().removeChannel(channel);
            }
          }, 100);
        };
      }
    }

    // ── Fresh creation path ────────────────────────────────────────
    const supabase = createClient();

    // Clean up stale channel from a previous config if present
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase.channel(`board-realtime-${boardId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    // --- task:upsert ---
    channel.on('broadcast', { event: 'task:upsert' }, ({ payload }) => {
      const taskData = payload.task as Partial<Task> & { id: string };
      if (DEV_MODE) {
        console.log('[useBoardRealtime] task:upsert received', taskData.id);
      }

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) {
            return [
              {
                ...taskData,
                assignees: [],
                labels: [],
                projects: [],
              } as Task,
            ];
          }
          const exists = old.some((t) => t.id === taskData.id);
          if (exists) {
            onTaskChangeRef.current?.(taskData as Task, 'UPDATE');
            return old.map((t) =>
              t.id === taskData.id ? { ...t, ...taskData } : t
            );
          }
          onTaskChangeRef.current?.(taskData as Task, 'INSERT');
          return [
            ...old,
            {
              ...taskData,
              assignees: [],
              labels: [],
              projects: [],
            } as Task,
          ];
        }
      );
    });

    // --- task:delete ---
    channel.on('broadcast', { event: 'task:delete' }, ({ payload }) => {
      const { taskId } = payload as { taskId: string };
      if (DEV_MODE) {
        console.log('[useBoardRealtime] task:delete received', taskId);
      }

      // Grab the task before removal so we can fire the callback
      const current = queryClient.getQueryData<Task[]>(['tasks', boardId]);
      const deleted = current?.find((t) => t.id === taskId);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((t) => t.id !== taskId);
        }
      );

      if (deleted) {
        onTaskChangeRef.current?.(deleted, 'DELETE');
      }
    });

    // --- list:upsert ---
    channel.on('broadcast', { event: 'list:upsert' }, ({ payload }) => {
      const listData = payload.list as Partial<TaskList> & { id: string };
      if (DEV_MODE) {
        console.log('[useBoardRealtime] list:upsert received', listData.id);
      }

      queryClient.setQueryData(
        ['task_lists', boardId],
        (old: TaskList[] | undefined) => {
          if (!old) return [listData as TaskList];
          const exists = old.some((l) => l.id === listData.id);
          if (exists) {
            onListChangeRef.current?.(listData as TaskList, 'UPDATE');
            return old.map((l) =>
              l.id === listData.id ? { ...l, ...listData } : l
            );
          }
          onListChangeRef.current?.(listData as TaskList, 'INSERT');
          return [...old, listData as TaskList];
        }
      );
    });

    // --- list:delete ---
    channel.on('broadcast', { event: 'list:delete' }, ({ payload }) => {
      const { listId } = payload as { listId: string };
      if (DEV_MODE) {
        console.log('[useBoardRealtime] list:delete received', listId);
      }

      const current = queryClient.getQueryData<TaskList[]>([
        'task_lists',
        boardId,
      ]);
      const deleted = current?.find((l) => l.id === listId);

      queryClient.setQueryData(
        ['task_lists', boardId],
        (old: TaskList[] | undefined) => {
          if (!old) return old;
          return old.filter((l) => l.id !== listId);
        }
      );

      // Also remove tasks belonging to the deleted list
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((t) => t.list_id !== listId);
        }
      );

      if (deleted) {
        onListChangeRef.current?.(deleted, 'DELETE');
      }
    });

    // --- task:relations-changed ---
    // Receiver-side batching: collect taskIds over a 150ms window, then
    // batch-fetch all relations in a single query.
    const fetchBatchedRelations = async () => {
      relationFetchTimerRef.current = null;
      const taskIds = [...pendingRelationIdsRef.current];
      pendingRelationIdsRef.current.clear();
      if (taskIds.length === 0) return;

      if (DEV_MODE) {
        console.log(
          `[useBoardRealtime] Batch-fetching relations for ${taskIds.length} task(s):`,
          taskIds
        );
      }

      try {
        const { data, error } = await supabase
          .from('tasks')
          .select(
            `
            id,
            assignees:task_assignees(
              user:users(id, display_name, avatar_url)
            ),
            labels:task_labels(
              label:workspace_task_labels(id, name, color, created_at)
            ),
            projects:task_project_tasks(
              project:task_projects(id, name, status)
            )
          `
          )
          .in('id', taskIds);

        if (error || !data) {
          if (DEV_MODE) {
            console.error(
              '[useBoardRealtime] Failed to batch-fetch relations:',
              error
            );
          }
          return;
        }

        const relationsMap = new Map<
          string,
          { assignees: unknown[]; labels: unknown[]; projects: unknown[] }
        >();
        for (const d of data as any[]) {
          relationsMap.set(d.id, {
            assignees:
              d.assignees?.map((a: any) => a.user).filter(Boolean) || [],
            labels: d.labels?.map((l: any) => l.label).filter(Boolean) || [],
            projects:
              d.projects?.map((p: any) => p.project).filter(Boolean) || [],
          });
        }

        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              const relations = relationsMap.get(task.id);
              return relations ? { ...task, ...relations } : task;
            });
          }
        );
      } catch (err) {
        if (DEV_MODE) {
          console.error(
            '[useBoardRealtime] Error batch-fetching relations:',
            err
          );
        }
      }
    };

    channel.on(
      'broadcast',
      { event: 'task:relations-changed' },
      ({ payload }) => {
        // Handle both single { taskId } and batched { taskIds } payloads
        const p = payload as { taskId?: string; taskIds?: string[] };
        const ids = p.taskIds ?? (p.taskId ? [p.taskId] : []);

        if (DEV_MODE) {
          console.log(
            '[useBoardRealtime] task:relations-changed received',
            ids
          );
        }

        for (const id of ids) {
          pendingRelationIdsRef.current.add(id);
        }

        // Debounce: wait 150ms for more events before fetching
        if (relationFetchTimerRef.current) {
          clearTimeout(relationFetchTimerRef.current);
        }
        relationFetchTimerRef.current = setTimeout(fetchBatchedRelations, 150);
      }
    );

    // --- task:deps-changed ---
    // Invalidate task-relationships caches so dependent components refetch.
    channel.on('broadcast', { event: 'task:deps-changed' }, ({ payload }) => {
      const { taskIds } = payload as { taskIds: string[] };
      if (DEV_MODE) {
        console.log('[useBoardRealtime] task:deps-changed received', taskIds);
      }
      for (const id of taskIds) {
        queryClient.invalidateQueries({
          queryKey: ['task-relationships', id],
        });
      }
    });

    channel.subscribe((status, err) => {
      if (DEV_MODE) {
        if (status === 'SUBSCRIBED') {
          console.log(
            `[useBoardRealtime] Channel connected for board ${boardId}`
          );
        } else if (status === 'CHANNEL_ERROR') {
          console.error(
            `[useBoardRealtime] Channel error for board ${boardId}:`,
            err
          );
        } else if (status === 'TIMED_OUT') {
          console.warn(
            `[useBoardRealtime] Channel timed out for board ${boardId}`
          );
        }
      }
    });

    // Deferred cleanup — gives StrictMode a chance to cancel and reuse
    return () => {
      // Clear receiver-side relation batch timer
      if (relationFetchTimerRef.current) {
        clearTimeout(relationFetchTimerRef.current);
        relationFetchTimerRef.current = null;
      }
      pendingRelationIdsRef.current.clear();

      const ch = channelRef.current;
      destroyTimerRef.current = setTimeout(() => {
        destroyTimerRef.current = null;
        if (ch && channelRef.current === ch) {
          channelRef.current = null;
          createClient().removeChannel(ch);
        }
      }, 100);
    };
  }, [boardId, enabled, queryClient]);

  // ── Sender-side batched broadcast ───────────────────────────────
  const flushBroadcastBatch = useCallback(() => {
    batchFlushTimerRef.current = null;
    const buffer = batchBufferRef.current;
    const channel = channelRef.current;
    if (buffer.size === 0 || !channel) {
      buffer.clear();
      return;
    }

    for (const [event, payloads] of buffer.entries()) {
      if (event === 'task:relations-changed') {
        // Deduplicate taskIds and send as a single batched message
        const taskIds = [
          ...new Set(
            payloads.flatMap((p) => {
              if (p.taskIds) return p.taskIds as string[];
              if (p.taskId) return [p.taskId as string];
              return [];
            })
          ),
        ];
        if (taskIds.length > 0) {
          channel.send({
            type: 'broadcast',
            event,
            payload: { taskIds },
          });
        }
      } else if (event === 'task:upsert') {
        // Merge updates for the same task ID (last-write-wins per field)
        const merged = new Map<string, Record<string, unknown>>();
        for (const p of payloads) {
          const task = p.task as Record<string, unknown> & { id: string };
          const existing = merged.get(task.id);
          merged.set(task.id, existing ? { ...existing, ...task } : task);
        }
        for (const task of merged.values()) {
          channel.send({
            type: 'broadcast',
            event,
            payload: { task },
          });
        }
      } else {
        // Other events (task:delete, list:upsert, list:delete) — send each
        for (const p of payloads) {
          channel.send({ type: 'broadcast', event, payload: p });
        }
      }
    }

    buffer.clear();
  }, []);

  const broadcast: BoardBroadcastFn = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      const buffer = batchBufferRef.current;
      if (!buffer.has(event)) buffer.set(event, []);
      buffer.get(event)!.push(payload);

      // Debounce: flush after 50ms of inactivity
      if (batchFlushTimerRef.current) {
        clearTimeout(batchFlushTimerRef.current);
      }
      batchFlushTimerRef.current = setTimeout(flushBroadcastBatch, 50);
    },
    [flushBroadcastBatch]
  );

  // Clean up sender batch timer on unmount (safety net)
  useEffect(() => {
    return () => {
      if (batchFlushTimerRef.current) {
        clearTimeout(batchFlushTimerRef.current);
        batchFlushTimerRef.current = null;
      }
      batchBufferRef.current.clear();
    };
  }, []);

  return { broadcast };
}
