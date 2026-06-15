'use client';

import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useCallback, useEffect, useRef } from 'react';
import {
  type BoardRealtimePayload,
  createRealtimeClientId,
  PRIVATE_TASK_REALTIME_CHANNEL_CONFIG,
  type RealtimeChannel,
  SEEN_REALTIME_EVENT_LIMIT,
} from './useBoardRealtime.types';

export const TASK_USER_REALTIME_CHANNEL_PREFIX = 'task-user-realtime';

export function getTaskUserRealtimeChannelName(userId: string) {
  return `${TASK_USER_REALTIME_CHANNEL_PREFIX}-${userId}`;
}

type TaskLike = { id?: string };
type TaskUserBroadcastFn = (
  event: string,
  payload: Record<string, unknown>
) => void;

let activeTaskUserBroadcast: TaskUserBroadcastFn | null = null;

export function setActiveTaskUserBroadcast(fn: TaskUserBroadcastFn | null) {
  activeTaskUserBroadcast = fn;
}

export function getActiveTaskUserBroadcast(): TaskUserBroadcastFn | null {
  return activeTaskUserBroadcast;
}

function rememberEventId(
  seen: Set<string>,
  payload: BoardRealtimePayload
): boolean {
  const eventId = payload.__tuturuuuBoardRealtimeEventId;
  if (typeof eventId !== 'string' || eventId.length === 0) return false;
  if (seen.has(eventId)) return true;

  seen.add(eventId);
  while (seen.size > SEEN_REALTIME_EVENT_LIMIT) {
    const first = seen.values().next().value;
    if (!first) break;
    seen.delete(first);
  }

  return false;
}

function patchTaskList<T extends TaskLike>(
  tasks: T[] | undefined,
  taskData: TaskLike
) {
  if (!tasks || !taskData.id) return tasks;
  return tasks.map((task) =>
    task.id === taskData.id ? ({ ...task, ...taskData } as T) : task
  );
}

function removeTaskFromList<T extends TaskLike>(
  tasks: T[] | undefined,
  taskId: string
) {
  return tasks?.filter((task) => task.id !== taskId);
}

function patchMyTasksCaches(queryClient: QueryClient, taskData: TaskLike) {
  queryClient.setQueriesData<{
    overdue?: TaskLike[];
    today?: TaskLike[];
    upcoming?: TaskLike[];
    completed?: TaskLike[];
  }>({ queryKey: ['my-tasks'] }, (old) =>
    old
      ? {
          ...old,
          overdue: patchTaskList(old.overdue, taskData) ?? old.overdue,
          today: patchTaskList(old.today, taskData) ?? old.today,
          upcoming: patchTaskList(old.upcoming, taskData) ?? old.upcoming,
          completed: patchTaskList(old.completed, taskData) ?? old.completed,
        }
      : old
  );

  queryClient.setQueriesData<{
    pages?: Array<{ completed?: TaskLike[] }>;
  }>({ queryKey: ['my-completed-tasks'] }, (old) =>
    old?.pages
      ? {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            completed:
              patchTaskList(page.completed, taskData) ?? page.completed,
          })),
        }
      : old
  );
}

function removeFromMyTasksCaches(queryClient: QueryClient, taskId: string) {
  queryClient.setQueriesData<{
    overdue?: TaskLike[];
    today?: TaskLike[];
    upcoming?: TaskLike[];
    completed?: TaskLike[];
  }>({ queryKey: ['my-tasks'] }, (old) =>
    old
      ? {
          ...old,
          overdue: removeTaskFromList(old.overdue, taskId) ?? old.overdue,
          today: removeTaskFromList(old.today, taskId) ?? old.today,
          upcoming: removeTaskFromList(old.upcoming, taskId) ?? old.upcoming,
          completed: removeTaskFromList(old.completed, taskId) ?? old.completed,
        }
      : old
  );

  queryClient.setQueriesData<{
    pages?: Array<{ completed?: TaskLike[] }>;
  }>({ queryKey: ['my-completed-tasks'] }, (old) =>
    old?.pages
      ? {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            completed:
              removeTaskFromList(page.completed, taskId) ?? page.completed,
          })),
        }
      : old
  );
}

export function useTaskUserRealtime(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientIdRef = useRef<string>(createRealtimeClientId());
  const eventCounterRef = useRef(0);

  const withEventMetadata = useCallback(
    (payload: Record<string, unknown>): BoardRealtimePayload => {
      eventCounterRef.current += 1;
      return {
        ...payload,
        __tuturuuuBoardRealtimeEventId: `${clientIdRef.current}:${Date.now()}:${eventCounterRef.current}`,
        __tuturuuuBoardRealtimeOrigin: clientIdRef.current,
      };
    },
    []
  );

  const broadcast = useCallback<TaskUserBroadcastFn>(
    (event, payload) => {
      const channel = channelRef.current;
      if (!channel) return;

      channel.send({
        type: 'broadcast',
        event,
        payload: withEventMetadata(payload),
      });
    },
    [withEventMetadata]
  );

  useEffect(() => {
    if (!userId) return;

    const scheduleInvalidate = () => {
      if (invalidateTimerRef.current) {
        clearTimeout(invalidateTimerRef.current);
      }

      invalidateTimerRef.current = setTimeout(() => {
        invalidateTimerRef.current = null;
        void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
        void queryClient.invalidateQueries({
          queryKey: ['my-completed-tasks'],
        });
      }, 150);
    };

    const handleEvent = (event: string, payload: BoardRealtimePayload) => {
      if (payload.__tuturuuuBoardRealtimeOrigin === clientIdRef.current) {
        return;
      }
      if (rememberEventId(seenEventIdsRef.current, payload)) return;

      if (event.endsWith(':batch')) {
        const baseEvent = event.slice(0, -':batch'.length);
        const payloads = Array.isArray(payload.payloads)
          ? payload.payloads
          : Array.isArray(payload.events)
            ? payload.events
                .filter((entry) => {
                  return (
                    typeof entry === 'object' &&
                    entry !== null &&
                    'payload' in entry
                  );
                })
                .map((entry) => (entry as { payload: unknown }).payload)
            : [];

        for (const childPayload of payloads) {
          if (
            typeof childPayload === 'object' &&
            childPayload !== null &&
            !Array.isArray(childPayload)
          ) {
            handleEvent(baseEvent, childPayload as BoardRealtimePayload);
          }
        }
        return;
      }

      if (event === 'task:upsert') {
        const task = payload.task as TaskLike | undefined;
        if (task?.id) patchMyTasksCaches(queryClient, task);
        scheduleInvalidate();
        return;
      }

      if (event === 'task:delete') {
        const taskId =
          typeof payload.taskId === 'string' ? payload.taskId : undefined;
        if (taskId) removeFromMyTasksCaches(queryClient, taskId);
        scheduleInvalidate();
        return;
      }

      if (
        event === 'task:relations-changed' ||
        event === 'task:deps-changed' ||
        event === 'list:upsert' ||
        event === 'list:delete'
      ) {
        scheduleInvalidate();
      }
    };

    const supabase = createClient();
    if (
      typeof supabase.channel !== 'function' ||
      typeof supabase.removeChannel !== 'function'
    ) {
      return;
    }

    const channel = supabase.channel(
      getTaskUserRealtimeChannelName(userId),
      PRIVATE_TASK_REALTIME_CHANNEL_CONFIG
    );
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'task:upsert' }, ({ payload }) => {
        handleEvent('task:upsert', payload as BoardRealtimePayload);
      })
      .on('broadcast', { event: 'task:delete' }, ({ payload }) => {
        handleEvent('task:delete', payload as BoardRealtimePayload);
      })
      .on('broadcast', { event: 'task:upsert:batch' }, ({ payload }) => {
        handleEvent('task:upsert:batch', payload as BoardRealtimePayload);
      })
      .on('broadcast', { event: 'task:delete:batch' }, ({ payload }) => {
        handleEvent('task:delete:batch', payload as BoardRealtimePayload);
      })
      .on('broadcast', { event: 'task:relations-changed' }, ({ payload }) => {
        handleEvent('task:relations-changed', payload as BoardRealtimePayload);
      })
      .on('broadcast', { event: 'task:deps-changed' }, ({ payload }) => {
        handleEvent('task:deps-changed', payload as BoardRealtimePayload);
      })
      .on(
        'broadcast',
        { event: 'task:relations-changed:batch' },
        ({ payload }) => {
          handleEvent(
            'task:relations-changed:batch',
            payload as BoardRealtimePayload
          );
        }
      )
      .on('broadcast', { event: 'task:deps-changed:batch' }, ({ payload }) => {
        handleEvent('task:deps-changed:batch', payload as BoardRealtimePayload);
      })
      .on('broadcast', { event: 'list:upsert' }, ({ payload }) => {
        handleEvent('list:upsert', payload as BoardRealtimePayload);
      })
      .on('broadcast', { event: 'list:delete' }, ({ payload }) => {
        handleEvent('list:delete', payload as BoardRealtimePayload);
      })
      .on('broadcast', { event: 'list:upsert:batch' }, ({ payload }) => {
        handleEvent('list:upsert:batch', payload as BoardRealtimePayload);
      })
      .on('broadcast', { event: 'list:delete:batch' }, ({ payload }) => {
        handleEvent('list:delete:batch', payload as BoardRealtimePayload);
      })
      .subscribe((status, error) => {
        if (
          DEV_MODE &&
          (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
        ) {
          console.warn('[useTaskUserRealtime] channel issue', {
            error,
            status,
            userId,
          });
        }
      });

    setActiveTaskUserBroadcast(broadcast);

    return () => {
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
      if (activeTaskUserBroadcast === broadcast) {
        setActiveTaskUserBroadcast(null);
      }
      if (invalidateTimerRef.current) {
        clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [broadcast, queryClient, userId]);

  return { broadcast };
}
