import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimeChannel } from '@tuturuuu/supabase/next/realtime';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { debounce } from 'lodash';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  detectElementChanges,
  type ElementChange,
} from '@/utils/excalidraw-helper';

export interface ElementSyncConfig {
  channelName: string;
  userId: string;
  enabled?: boolean;
  debounceMs?: number;
  onRemoteChanges?: (elements: ExcalidrawElement[]) => void;
  onError?: (error: Error) => void;
}

export interface ElementSyncResult {
  broadcastChanges: (
    previousElements: readonly ExcalidrawElement[],
    currentElements: readonly ExcalidrawElement[]
  ) => void;
  isConnected: boolean;
  error: boolean;
}

export function useExcalidrawElementSync({
  channelName,
  userId,
  enabled = true,
  debounceMs = 100,
  onRemoteChanges,
  onError,
}: ElementSyncConfig): ElementSyncResult {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isCleanedUpRef = useRef(false);
  const pendingChangesRef = useRef<ElementChange[]>([]);
  const errorCountRef = useRef(0);
  const destroyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MAX_ERROR_COUNT = 3;

  const handleError = useCallback(
    (err: unknown) => {
      errorCountRef.current++;
      if (errorCountRef.current >= MAX_ERROR_COUNT) {
        setError(true);
      }
      if (DEV_MODE) {
        console.warn('Error in element sync:', err);
      }
      if (onError && err instanceof Error) {
        onError(err);
      }
    },
    [onError]
  );

  // Flush pending changes to the channel
  const flushChanges = useCallback(async () => {
    if (!channelRef.current || pendingChangesRef.current.length === 0) return;
    if (errorCountRef.current >= MAX_ERROR_COUNT) return;

    const changes = pendingChangesRef.current;
    pendingChangesRef.current = [];

    // Deduplicate changes: keep only the latest version of each element
    const deduplicatedChanges = new Map<string, ElementChange>();
    for (const change of changes) {
      const existing = deduplicatedChanges.get(change.element.id);

      // Keep the change with the highest version
      if (
        !existing ||
        change.element.version > existing.element.version ||
        (change.element.version === existing.element.version &&
          change.element.versionNonce > existing.element.versionNonce)
      ) {
        deduplicatedChanges.set(change.element.id, change);
      }
    }

    const finalChanges = Array.from(deduplicatedChanges.values());

    try {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'element-changes',
        payload: {
          senderId: userId,
          changes: finalChanges.map((c) => ({
            element: c.element,
            type: c.type,
          })),
          timestamp: Date.now(),
        },
      });

      // Reset error count on success
      errorCountRef.current = 0;

      if (DEV_MODE) {
        console.log(
          `Broadcasted ${finalChanges.length} element changes (deduplicated from ${changes.length})`
        );
      }
    } catch (err) {
      // Re-queue the deduplicated changes on failure
      pendingChangesRef.current = [
        ...finalChanges,
        ...pendingChangesRef.current,
      ];
      handleError(err);
    }
  }, [userId, handleError]);

  // Create debounced flush with maxWait to ensure updates during continuous drawing
  const debouncedFlush = useMemo(
    () =>
      debounce(() => {
        flushChanges();
      }, debounceMs),
    [flushChanges, debounceMs]
  );

  // Broadcast element changes with debouncing
  const broadcastChanges = useCallback(
    (
      previousElements: readonly ExcalidrawElement[],
      currentElements: readonly ExcalidrawElement[]
    ) => {
      if (!enabled || !channelRef.current) return;

      const changes = detectElementChanges(previousElements, currentElements);

      // Add to pending changes
      pendingChangesRef.current.push(...changes);

      // Trigger debounced flush with maxWait
      debouncedFlush();
    },
    [enabled, debouncedFlush]
  );

  // Set up the channel — uses deferred cleanup so StrictMode's
  // mount → cleanup → remount reuses the existing channel.
  useEffect(() => {
    if (!enabled || !channelName) return;

    // ── StrictMode reuse path ───────────────────────────────────────
    if (destroyTimerRef.current) {
      clearTimeout(destroyTimerRef.current);
      destroyTimerRef.current = null;

      if (channelRef.current) {
        if (DEV_MODE) {
          console.log('♻️ Reusing element sync channel (StrictMode)');
        }
        isCleanedUpRef.current = false;
        return () => {
          isCleanedUpRef.current = true;
          debouncedFlush.cancel();
          const channel = channelRef.current;
          destroyTimerRef.current = setTimeout(() => {
            destroyTimerRef.current = null;
            if (channel && channelRef.current === channel) {
              createClient().removeChannel(channel);
              channelRef.current = null;
            }
          }, 100);
        };
      }
    }

    // ── Fresh creation path ─────────────────────────────────────────
    isCleanedUpRef.current = false;
    const supabase = createClient();

    // Clean up stale channel from a previous config if present
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase.channel(`${channelName}-elements`, {
      config: {
        broadcast: {
          self: false, // Don't receive own broadcasts
        },
      },
    });

    channelRef.current = channel;

    channel
      .on(
        'broadcast',
        { event: 'element-changes' },
        (payload: {
          payload: {
            senderId: string;
            changes: ElementChange[];
            timestamp: number;
          };
        }) => {
          try {
            const { senderId, changes } = payload.payload;

            // Ignore own broadcasts (extra safety)
            if (senderId === userId) return;

            if (DEV_MODE) {
              console.log(
                `Received ${changes.length} element changes from ${senderId}`
              );
            }

            // Extract elements from changes and notify
            const remoteElements = changes.map((c) => c.element);

            if (onRemoteChanges && remoteElements.length > 0) {
              onRemoteChanges(remoteElements);
            }

            // Reset error count on successful receive
            errorCountRef.current = 0;
          } catch (err) {
            handleError(err);
          }
        }
      )
      .subscribe((status) => {
        if (DEV_MODE) {
          console.log('Element sync channel status:', status);
        }

        switch (status) {
          case 'SUBSCRIBED':
            setIsConnected(true);
            errorCountRef.current = 0;
            break;
          case 'CHANNEL_ERROR':
            setIsConnected(false);
            handleError(new Error('Channel error'));
            break;
          case 'TIMED_OUT':
            setIsConnected(false);
            handleError(new Error('Channel timed out'));
            break;
          case 'CLOSED':
            setIsConnected(false);
            break;
        }
      });

    // Deferred cleanup — gives StrictMode a chance to cancel and reuse
    return () => {
      isCleanedUpRef.current = true;
      debouncedFlush.cancel();
      const ch = channelRef.current;
      destroyTimerRef.current = setTimeout(() => {
        destroyTimerRef.current = null;
        if (ch && channelRef.current === ch) {
          supabase.removeChannel(ch);
          channelRef.current = null;
        }
      }, 100);
    };
  }, [
    channelName,
    userId,
    enabled,
    onRemoteChanges,
    handleError,
    debouncedFlush,
  ]);

  return {
    broadcastChanges,
    isConnected,
    error,
  };
}
