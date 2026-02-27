import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimeChannel } from '@tuturuuu/supabase/next/realtime';
import { usePageVisibility } from '@tuturuuu/ui/hooks/use-page-visibility';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type SelectedElementIds,
  sanitizeSelectedElementIds,
} from '@/utils/excalidraw-selection';

export interface ExcalidrawCursorUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

export interface ExcalidrawCursorPosition {
  x: number;
  y: number;
  tool?: string;
  user: ExcalidrawCursorUser;
  lastUpdatedAt: number;
}

export interface ExcalidrawCursorConfig {
  channelName: string;
  user: ExcalidrawCursorUser;
  enabled?: boolean;
  throttleMs?: number;
  cursorTimeoutMs?: number;
}

export interface ExcalidrawCursorResult {
  remoteCursors: Map<string, ExcalidrawCursorPosition>;
  remoteSelections: Map<string, SelectedElementIds>;
  broadcastCursor: (x: number, y: number, tool?: string) => void;
  broadcastSelection: (selectedElementIds: SelectedElementIds) => void;
  isConnected: boolean;
  error: boolean;
}

interface RemoteSelectionState {
  selectedElementIds: SelectedElementIds;
  lastUpdatedAt: number;
}

export function useExcalidrawCursor({
  channelName,
  user,
  enabled = true,
  throttleMs = 250,
  cursorTimeoutMs = 5000,
}: ExcalidrawCursorConfig): ExcalidrawCursorResult {
  const [remoteCursors, setRemoteCursors] = useState<
    Map<string, ExcalidrawCursorPosition>
  >(new Map());
  const [remoteSelectionStates, setRemoteSelectionStates] = useState<
    Map<string, RemoteSelectionState>
  >(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(false);

  const pageVisible = usePageVisibility();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isCleanedUpRef = useRef(false);
  const lastBroadcastTimeRef = useRef(0);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorCountRef = useRef(0);
  const destroyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetPositionRef = useRef({ x: -1000, y: -1000 });
  const currentPositionRef = useRef({ x: -1000, y: -1000 });
  const currentToolRef = useRef<string | undefined>(undefined);
  const animationFrameRef = useRef<number | null>(null);
  const pageVisibleRef = useRef(pageVisible);
  pageVisibleRef.current = pageVisible;

  const MAX_ERROR_COUNT = 3;
  const ANIMATION_FACTOR = 0.2;
  const MOVEMENT_THRESHOLD = 5;

  const handleError = useCallback((err: unknown) => {
    errorCountRef.current++;
    if (errorCountRef.current >= MAX_ERROR_COUNT) {
      setError(true);
    }
    if (DEV_MODE) {
      console.warn('Error in cursor tracking:', err);
    }
  }, []);

  // Send cursor position with throttling
  const sendCursor = useCallback(
    async (x: number, y: number, tool?: string) => {
      if (!channelRef.current || !enabled) return;
      if (errorCountRef.current >= MAX_ERROR_COUNT) return;
      if (!pageVisibleRef.current) return;

      const now = Date.now();
      const timeSinceLastBroadcast = now - lastBroadcastTimeRef.current;

      const doBroadcast = async () => {
        try {
          await channelRef.current?.send({
            type: 'broadcast',
            event: 'cursor-move',
            payload: {
              x,
              y,
              tool,
              user,
            },
          });

          lastBroadcastTimeRef.current = Date.now();
          errorCountRef.current = 0;
        } catch (err) {
          handleError(err);
        }
      };

      if (timeSinceLastBroadcast < throttleMs) {
        // Throttle: schedule for later if not already scheduled
        if (!throttleTimeoutRef.current) {
          throttleTimeoutRef.current = setTimeout(async () => {
            await doBroadcast();
            throttleTimeoutRef.current = null;
          }, throttleMs - timeSinceLastBroadcast);
        }
      } else {
        // Broadcast immediately
        await doBroadcast();
      }
    },
    [enabled, throttleMs, user, handleError]
  );

  const sendSelection = useCallback(
    async (selectedElementIds: SelectedElementIds) => {
      if (!channelRef.current || !enabled) return;
      if (errorCountRef.current >= MAX_ERROR_COUNT) return;

      try {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'selection-change',
          payload: {
            senderId: user.id,
            selectedElementIds,
            timestamp: Date.now(),
          },
        });

        errorCountRef.current = 0;
      } catch (err) {
        handleError(err);
      }
    },
    [enabled, user.id, handleError]
  );

  const smoothAnimate = useCallback(() => {
    if (!enabled || !user.id) {
      animationFrameRef.current = requestAnimationFrame(smoothAnimate);
      return;
    }

    currentPositionRef.current.x +=
      (targetPositionRef.current.x - currentPositionRef.current.x) *
      ANIMATION_FACTOR;
    currentPositionRef.current.y +=
      (targetPositionRef.current.y - currentPositionRef.current.y) *
      ANIMATION_FACTOR;

    const distance = Math.hypot(
      targetPositionRef.current.x - currentPositionRef.current.x,
      targetPositionRef.current.y - currentPositionRef.current.y
    );

    if (distance > MOVEMENT_THRESHOLD && pageVisibleRef.current) {
      void sendCursor(
        currentPositionRef.current.x,
        currentPositionRef.current.y,
        currentToolRef.current
      );
    }

    animationFrameRef.current = requestAnimationFrame(smoothAnimate);
  }, [enabled, user.id, sendCursor]);

  const broadcastCursor = useCallback(
    (x: number, y: number, tool?: string) => {
      if (!enabled || !user.id) return;

      currentToolRef.current = tool;

      const shouldHideCursor = x <= -1000 || y <= -1000;
      if (shouldHideCursor) {
        targetPositionRef.current = { x, y };
        currentPositionRef.current = { x, y };
        void sendCursor(x, y, tool);
        return;
      }

      targetPositionRef.current = { x, y };
    },
    [enabled, user.id, sendCursor]
  );

  const broadcastSelection = useCallback(
    (selectedElementIds: SelectedElementIds) => {
      if (!enabled || !user.id) return;

      const normalizedSelection =
        sanitizeSelectedElementIds(selectedElementIds);
      void sendSelection(normalizedSelection ?? {});
    },
    [enabled, user.id, sendSelection]
  );

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(smoothAnimate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [smoothAnimate]);

  // Clean up stale cursors
  useEffect(() => {
    if (error || !enabled) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => {
        const updated = new Map(prev);
        let hasChanges = false;

        for (const [userId, cursor] of updated.entries()) {
          if (now - cursor.lastUpdatedAt > cursorTimeoutMs) {
            updated.delete(userId);
            hasChanges = true;
          }
        }

        return hasChanges ? updated : prev;
      });

      setRemoteSelectionStates((prev) => {
        const updated = new Map(prev);
        let hasChanges = false;

        for (const [userId, selectionState] of updated.entries()) {
          if (now - selectionState.lastUpdatedAt > cursorTimeoutMs) {
            updated.delete(userId);
            hasChanges = true;
          }
        }

        return hasChanges ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [error, enabled, cursorTimeoutMs]);

  // Set up the channel — uses deferred cleanup so StrictMode's
  // mount → cleanup → remount reuses the existing channel.
  useEffect(() => {
    if (!enabled || !channelName || !user.id) return;

    // ── StrictMode reuse path ───────────────────────────────────────
    if (destroyTimerRef.current) {
      clearTimeout(destroyTimerRef.current);
      destroyTimerRef.current = null;

      if (channelRef.current) {
        if (DEV_MODE) {
          console.log('♻️ Reusing cursor channel (StrictMode)');
        }
        isCleanedUpRef.current = false;
        return () => {
          isCleanedUpRef.current = true;
          if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current);
            throttleTimeoutRef.current = null;
          }
          const channel = channelRef.current;
          destroyTimerRef.current = setTimeout(() => {
            destroyTimerRef.current = null;
            if (channel && channelRef.current === channel) {
              // Broadcast cursor removal (best effort)
              if (user.id) {
                try {
                  channel.send({
                    type: 'broadcast',
                    event: 'cursor-move',
                    payload: { x: -1000, y: -1000, user },
                  });

                  channel.send({
                    type: 'broadcast',
                    event: 'selection-change',
                    payload: {
                      senderId: user.id,
                      selectedElementIds: {},
                      timestamp: Date.now(),
                    },
                  });
                } catch {
                  // Ignore errors during cleanup
                }
              }
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

    const channel = supabase.channel(`${channelName}-cursors`, {
      config: {
        broadcast: {
          self: false,
        },
      },
    });

    channelRef.current = channel;

    channel
      .on(
        'broadcast',
        { event: 'cursor-move' },
        (payload: {
          payload: {
            x: number;
            y: number;
            tool?: string;
            user: ExcalidrawCursorUser;
          };
        }) => {
          try {
            const { x, y, tool, user: broadcastUser } = payload.payload;

            // Ignore own broadcasts (extra safety)
            if (broadcastUser.id === user.id) return;

            setRemoteCursors((prev) => {
              const updated = new Map(prev);
              updated.set(broadcastUser.id, {
                x,
                y,
                tool,
                user: broadcastUser,
                lastUpdatedAt: Date.now(),
              });
              return updated;
            });

            errorCountRef.current = 0;
          } catch (err) {
            handleError(err);
          }
        }
      )
      .on(
        'broadcast',
        { event: 'selection-change' },
        (payload: {
          payload: {
            senderId: string;
            selectedElementIds?: Record<string, boolean | undefined>;
            timestamp: number;
          };
        }) => {
          try {
            const { senderId, selectedElementIds, timestamp } = payload.payload;

            if (senderId === user.id) return;

            const normalizedSelection =
              sanitizeSelectedElementIds(selectedElementIds);

            setRemoteSelectionStates((prev) => {
              const updated = new Map(prev);

              if (!normalizedSelection) {
                updated.delete(senderId);
              } else {
                updated.set(senderId, {
                  selectedElementIds: normalizedSelection,
                  lastUpdatedAt: timestamp || Date.now(),
                });
              }

              return updated;
            });

            errorCountRef.current = 0;
          } catch (err) {
            handleError(err);
          }
        }
      )
      .subscribe((status) => {
        if (DEV_MODE) {
          console.log('Cursor channel status:', status);
        }

        switch (status) {
          case 'SUBSCRIBED':
            setIsConnected(true);
            errorCountRef.current = 0;
            break;
          case 'CHANNEL_ERROR':
            setIsConnected(false);
            handleError(new Error('Cursor channel error'));
            break;
          case 'TIMED_OUT':
            setIsConnected(false);
            handleError(new Error('Cursor channel timed out'));
            break;
          case 'CLOSED':
            setIsConnected(false);
            setRemoteCursors(new Map());
            setRemoteSelectionStates(new Map());
            break;
        }
      });

    // Deferred cleanup — gives StrictMode a chance to cancel and reuse
    return () => {
      isCleanedUpRef.current = true;
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }
      const ch = channelRef.current;
      destroyTimerRef.current = setTimeout(() => {
        destroyTimerRef.current = null;
        if (ch && channelRef.current === ch) {
          // Broadcast cursor removal (best effort)
          if (user.id) {
            try {
              ch.send({
                type: 'broadcast',
                event: 'cursor-move',
                payload: { x: -1000, y: -1000, user },
              });

              ch.send({
                type: 'broadcast',
                event: 'selection-change',
                payload: {
                  senderId: user.id,
                  selectedElementIds: {},
                  timestamp: Date.now(),
                },
              });
            } catch {
              // Ignore errors during cleanup
            }
          }
          supabase.removeChannel(ch);
          channelRef.current = null;
        }
      }, 100);
    };
  }, [channelName, user, enabled, handleError]);

  const remoteSelections = useMemo(() => {
    return new Map(
      Array.from(remoteSelectionStates.entries()).map(
        ([userId, selectionState]) => [
          userId,
          selectionState.selectedElementIds,
        ]
      )
    );
  }, [remoteSelectionStates]);

  return {
    remoteCursors,
    remoteSelections,
    broadcastCursor,
    broadcastSelection,
    isConnected,
    error,
  };
}
