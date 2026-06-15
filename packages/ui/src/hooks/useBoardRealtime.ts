import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';
import type { BoardBroadcastFn } from '../components/ui/tu-do/shared/board-broadcast-context';
import { toast } from './use-toast';
import {
  type BoardRealtimePayload,
  createRealtimeClientId,
  isBoardRealtimeEnvelope,
  LOCAL_BROADCAST_CHANNEL_PREFIX,
  PRIVATE_TASK_REALTIME_CHANNEL_CONFIG,
  type RealtimeChannel,
  SEEN_REALTIME_EVENT_LIMIT,
} from './useBoardRealtime.types';
import { useBoardRealtimeEventHandler } from './useBoardRealtimeEventHandler';

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
    onTaskRelationsChange?: (taskIds: string[]) => void;
  }
): { broadcast: BoardBroadcastFn } {
  const {
    enabled = true,
    onTaskChange,
    onListChange,
    onTaskRelationsChange,
  } = options ?? {};
  const queryClient = useQueryClient();
  const t = useTranslations('common');

  // Hold channel ref so the returned broadcast fn always targets the current channel
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localChannelRef = useRef<BroadcastChannel | null>(null);
  const localClientIdRef = useRef<string>(createRealtimeClientId());
  const localEventCounterRef = useRef(0);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const hasShownConnectionToastRef = useRef(false);

  // Deferred cleanup timer — prevents StrictMode "leave then immediate rejoin"
  // race that kills the subscription on the Supabase Realtime server.
  const destroyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store callbacks in refs so they don't cause channel re-creation when
  // consumers pass non-memoized functions.
  const onTaskChangeRef = useRef(onTaskChange);
  onTaskChangeRef.current = onTaskChange;
  const onListChangeRef = useRef(onListChange);
  onListChangeRef.current = onListChange;
  const onTaskRelationsChangeRef = useRef(onTaskRelationsChange);
  onTaskRelationsChangeRef.current = onTaskRelationsChange;

  // ── Sender-side broadcast batching ──────────────────────────────
  // Buffers rapid-fire broadcast calls (e.g. bulk operations) over a
  // 50ms window, then flushes them as deduplicated messages.
  const batchBufferRef = useRef<Map<string, Record<string, unknown>[]>>(
    new Map()
  );
  const batchFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rememberEventId = useCallback((payload: BoardRealtimePayload) => {
    const eventId = payload.__tuturuuuBoardRealtimeEventId;
    if (typeof eventId !== 'string' || eventId.length === 0) return false;

    const seen = seenEventIdsRef.current;
    if (seen.has(eventId)) return true;

    seen.add(eventId);
    while (seen.size > SEEN_REALTIME_EVENT_LIMIT) {
      const first = seen.values().next().value;
      if (!first) break;
      seen.delete(first);
    }

    return false;
  }, []);

  const withEventMetadata = useCallback(
    (payload: Record<string, unknown>): BoardRealtimePayload => {
      localEventCounterRef.current += 1;
      return {
        ...payload,
        __tuturuuuBoardRealtimeEventId: `${localClientIdRef.current}:${Date.now()}:${localEventCounterRef.current}`,
        __tuturuuuBoardRealtimeOrigin: localClientIdRef.current,
      };
    },
    []
  );

  const postLocalBroadcast = useCallback(
    (event: string, payload: BoardRealtimePayload) => {
      const localChannel = localChannelRef.current;
      if (!localChannel) return;

      try {
        localChannel.postMessage({ event, payload });
      } catch (error) {
        if (DEV_MODE) {
          console.error(
            '[useBoardRealtime] Failed local tab broadcast:',
            error
          );
        }
      }
    },
    []
  );

  const handleBoardRealtimeEvent = useBoardRealtimeEventHandler({
    boardId,
    onListChangeRef,
    onTaskChangeRef,
    onTaskRelationsChangeRef,
    queryClient,
    rememberEventId,
  });

  const sendBoardRealtimeEvent = useCallback(
    (
      channel: RealtimeChannel | null,
      event: string,
      payload: Record<string, unknown>
    ) => {
      const payloadWithMetadata = withEventMetadata(payload);
      handleBoardRealtimeEvent(event, payloadWithMetadata);
      postLocalBroadcast(event, payloadWithMetadata);
      channel?.send({
        type: 'broadcast',
        event,
        payload: payloadWithMetadata,
      });
    },
    [handleBoardRealtimeEvent, postLocalBroadcast, withEventMetadata]
  );

  useEffect(() => {
    if (!boardId || typeof BroadcastChannel === 'undefined') return;

    const localChannel = new BroadcastChannel(
      `${LOCAL_BROADCAST_CHANNEL_PREFIX}:${boardId}`
    );
    localChannelRef.current = localChannel;
    localChannel.onmessage = (message) => {
      if (!isBoardRealtimeEnvelope(message.data)) return;
      handleBoardRealtimeEvent(message.data.event, message.data.payload);
    };

    return () => {
      if (localChannelRef.current === localChannel) {
        localChannelRef.current = null;
      }
      localChannel.close();
    };
  }, [boardId, handleBoardRealtimeEvent]);

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

    const channel = supabase.channel(
      `board-realtime-${boardId}`,
      PRIVATE_TASK_REALTIME_CHANNEL_CONFIG
    );
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'task:upsert' }, ({ payload }) => {
        handleBoardRealtimeEvent(
          'task:upsert',
          payload as BoardRealtimePayload
        );
      })
      .on('broadcast', { event: 'task:delete' }, ({ payload }) => {
        handleBoardRealtimeEvent(
          'task:delete',
          payload as BoardRealtimePayload
        );
      })
      .on('broadcast', { event: 'task:upsert:batch' }, ({ payload }) => {
        handleBoardRealtimeEvent(
          'task:upsert:batch',
          payload as BoardRealtimePayload
        );
      })
      .on('broadcast', { event: 'task:delete:batch' }, ({ payload }) => {
        handleBoardRealtimeEvent(
          'task:delete:batch',
          payload as BoardRealtimePayload
        );
      })
      .on('broadcast', { event: 'list:upsert' }, ({ payload }) => {
        handleBoardRealtimeEvent(
          'list:upsert',
          payload as BoardRealtimePayload
        );
      })
      .on('broadcast', { event: 'list:delete' }, ({ payload }) => {
        handleBoardRealtimeEvent(
          'list:delete',
          payload as BoardRealtimePayload
        );
      })
      .on('broadcast', { event: 'list:upsert:batch' }, ({ payload }) => {
        handleBoardRealtimeEvent(
          'list:upsert:batch',
          payload as BoardRealtimePayload
        );
      })
      .on('broadcast', { event: 'list:delete:batch' }, ({ payload }) => {
        handleBoardRealtimeEvent(
          'list:delete:batch',
          payload as BoardRealtimePayload
        );
      })
      .on('broadcast', { event: 'task:relations-changed' }, ({ payload }) => {
        handleBoardRealtimeEvent(
          'task:relations-changed',
          payload as BoardRealtimePayload
        );
      })
      .on('broadcast', { event: 'task:deps-changed' }, ({ payload }) => {
        handleBoardRealtimeEvent(
          'task:deps-changed',
          payload as BoardRealtimePayload
        );
      })
      .on(
        'broadcast',
        { event: 'task:relations-changed:batch' },
        ({ payload }) => {
          handleBoardRealtimeEvent(
            'task:relations-changed:batch',
            payload as BoardRealtimePayload
          );
        }
      )
      .on('broadcast', { event: 'task:deps-changed:batch' }, ({ payload }) => {
        handleBoardRealtimeEvent(
          'task:deps-changed:batch',
          payload as BoardRealtimePayload
        );
      });

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        hasShownConnectionToastRef.current = false;
      }

      if (DEV_MODE) {
        if (status === 'SUBSCRIBED') {
          console.log(
            `[useBoardRealtime] Channel connected for board ${boardId}`
          );
        } else if (status === 'CHANNEL_ERROR') {
          console.warn(
            `[useBoardRealtime] Channel error for board ${boardId}`,
            err
          );
        } else if (status === 'TIMED_OUT') {
          console.warn(
            `[useBoardRealtime] Channel timed out for board ${boardId}`
          );
        }
      }

      if (
        (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') &&
        !hasShownConnectionToastRef.current
      ) {
        hasShownConnectionToastRef.current = true;
        toast({
          description: t('realtime_connection_issue_description'),
          title: t('realtime_connection_issue_title'),
          variant: 'destructive',
        });
      }
    });

    return () => {
      const ch = channelRef.current;
      destroyTimerRef.current = setTimeout(() => {
        destroyTimerRef.current = null;
        if (ch && channelRef.current === ch) {
          channelRef.current = null;
          createClient().removeChannel(ch);
        }
      }, 100);
    };
  }, [boardId, enabled, handleBoardRealtimeEvent, t]);

  // ── Sender-side batched broadcast ───────────────────────────────
  const flushBroadcastBatch = useCallback(() => {
    batchFlushTimerRef.current = null;
    const buffer = batchBufferRef.current;
    const channel = channelRef.current;
    if (buffer.size === 0) {
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
          sendBoardRealtimeEvent(channel, event, { taskIds });
        }
      } else if (event === 'task:upsert') {
        // Merge updates for the same task ID (last-write-wins per field)
        const merged = new Map<string, Record<string, unknown>>();
        for (const p of payloads) {
          const task = p.task as Record<string, unknown> & { id: string };
          const existing = merged.get(task.id);
          merged.set(task.id, existing ? { ...existing, ...task } : task);
        }
        const tasks = [...merged.values()];
        if (tasks.length > 1) {
          sendBoardRealtimeEvent(channel, 'task:upsert:batch', {
            payloads: tasks.map((task) => ({ task })),
          });
          continue;
        }
        for (const task of tasks) {
          sendBoardRealtimeEvent(channel, event, { task });
        }
      } else {
        // Other events (task:delete, list:upsert, list:delete) — send each
        if (payloads.length > 1) {
          sendBoardRealtimeEvent(channel, `${event}:batch`, {
            payloads,
          });
          continue;
        }
        for (const p of payloads) {
          sendBoardRealtimeEvent(channel, event, p);
        }
      }
    }

    buffer.clear();
  }, [sendBoardRealtimeEvent]);

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
