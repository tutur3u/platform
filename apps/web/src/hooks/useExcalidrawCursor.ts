import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimeChannel } from '@tuturuuu/supabase/next/realtime';
import { usePageVisibility } from '@tuturuuu/ui/hooks/use-page-visibility';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  broadcastCursor: (x: number, y: number, tool?: string) => void;
  isConnected: boolean;
  error: boolean;
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
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(false);

  const pageVisible = usePageVisibility();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isCleanedUpRef = useRef(false);
  const lastBroadcastTimeRef = useRef(0);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorCountRef = useRef(0);
  const pageVisibleRef = useRef(pageVisible);
  pageVisibleRef.current = pageVisible;

  const MAX_ERROR_COUNT = 3;

  const handleError = useCallback((err: unknown) => {
    errorCountRef.current++;
    if (errorCountRef.current >= MAX_ERROR_COUNT) {
      setError(true);
    }
    if (DEV_MODE) {
      console.warn('Error in cursor tracking:', err);
    }
  }, []);

  // Broadcast cursor position with throttling
  const broadcastCursor = useCallback(
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
    }, 1000);

    return () => clearInterval(interval);
  }, [error, enabled, cursorTimeoutMs]);

  // Set up the channel
  useEffect(() => {
    if (!enabled || !channelName || !user.id) return;

    isCleanedUpRef.current = false;
    const supabase = createClient();

    const setupChannel = async () => {
      if (isCleanedUpRef.current) return;

      try {
        // Clean up existing channel
        if (channelRef.current) {
          await supabase.removeChannel(channelRef.current);
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
                break;
            }
          });
      } catch (err) {
        handleError(err);
      }
    };

    setupChannel();

    return () => {
      isCleanedUpRef.current = true;

      // Clear pending throttled broadcast
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }

      // Broadcast cursor removal (best effort)
      if (channelRef.current && user.id) {
        try {
          channelRef.current.send({
            type: 'broadcast',
            event: 'cursor-move',
            payload: {
              x: -1000,
              y: -1000,
              user,
            },
          });
        } catch {
          // Ignore errors during cleanup
        }
      }

      // Remove channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [channelName, user, enabled, handleError]);

  return {
    remoteCursors,
    broadcastCursor,
    isConnected,
    error,
  };
}
