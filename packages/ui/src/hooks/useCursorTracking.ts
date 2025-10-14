import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimeChannel } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface CursorPosition {
  user: User;
  x: number;
  y: number;
  lastUpdatedAt: number;
}

export function useCursorTracking(
  channelName: string,
  containerRef?: RefObject<HTMLElement | null>
) {
  const [cursors, setCursors] = useState<Map<string, CursorPosition>>(
    new Map()
  );
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [error, setError] = useState<boolean>(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isCleanedUpRef = useRef(false);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastBroadcastTimeRef = useRef<number>(0);
  const errorCountRef = useRef<number>(0);

  const THROTTLE_MS = 50; // Broadcast cursor position every 50ms max
  const CURSOR_TIMEOUT = 5000; // Remove cursor if no update for 5 seconds
  const MAX_ERROR_COUNT = 3; // Disable after 3 consecutive errors

  const broadcastCursor = useCallback(
    async (x: number, y: number, user: User) => {
      if (!channelRef.current) return;
      // Check error count instead of state to avoid dependency
      if (errorCountRef.current >= MAX_ERROR_COUNT) return;

      try {
        const now = Date.now();
        const timeSinceLastBroadcast = now - lastBroadcastTimeRef.current;
        if (timeSinceLastBroadcast < THROTTLE_MS) {
          // Throttle: schedule a broadcast for later if not already scheduled
          if (!throttleTimeoutRef.current) {
            throttleTimeoutRef.current = setTimeout(async () => {
              try {
                await channelRef.current?.send({
                  type: 'broadcast',
                  event: 'cursor-move',
                  payload: { x, y, user },
                });

                lastBroadcastTimeRef.current = Date.now();
                throttleTimeoutRef.current = null;
                // Reset error count on successful broadcast
                errorCountRef.current = 0;
              } catch (err) {
                handleError(err);
              }
            }, THROTTLE_MS - timeSinceLastBroadcast);
          }
        } else {
          // Broadcast immediately
          await channelRef.current.send({
            type: 'broadcast',
            event: 'cursor-move',
            payload: { x, y, user },
          });

          lastBroadcastTimeRef.current = now;
          // Reset error count on successful broadcast
          errorCountRef.current = 0;
        }
      } catch (err) {
        handleError(err);
      }
    },
    [] // No dependencies - uses only refs
  );

  const handleError = useCallback((err: any) => {
    errorCountRef.current++;
    if (errorCountRef.current >= MAX_ERROR_COUNT) {
      setError(true);
    }
    if (DEV_MODE) {
      console.warn('Error in cursor tracking:', err);
    }
  }, []);

  // Clean up stale cursors
  useEffect(() => {
    // Don't run cleanup if in error state
    if (error) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        const updated = new Map(prev);
        let hasChanges = false;

        for (const [userId, cursor] of updated.entries()) {
          if (now - cursor.lastUpdatedAt > CURSOR_TIMEOUT) {
            updated.delete(userId);
            hasChanges = true;
          }
        }

        return hasChanges ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [error]);

  useEffect(() => {
    if (!channelName) return;
    isCleanedUpRef.current = false;

    const supabase = createClient();
    let container: HTMLElement | null = null;
    let handleMouseMove: ((event: MouseEvent) => void) | null = null;
    let handleMouseLeave: (() => void) | null = null;

    const setupCursorTracking = async () => {
      if (isCleanedUpRef.current) return;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) return;

        const { data: userData, error: userDataError } = await supabase
          .from('users')
          .select('display_name')
          .eq('id', user.id)
          .single();

        if (userDataError) {
          handleError(userDataError);
          return;
        }

        setCurrentUserId(user.id);

        // Clean up existing channel before creating a new one
        if (channelRef.current) {
          await supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        const channel = supabase.channel(channelName, {
          config: {
            broadcast: {
              self: false, // Don't receive own broadcasts
            },
          },
        });

        channelRef.current = channel;

        // Listen for cursor movements from other users
        channel
          .on('broadcast', { event: 'cursor-move' }, (payload) => {
            try {
              const { x, y, user: broadcastUser } = payload.payload;

              if (broadcastUser.id !== user.id) {
                setCursors((prev) => {
                  const updated = new Map(prev);
                  updated.set(broadcastUser.id || '', {
                    x,
                    y,
                    user: broadcastUser,
                    lastUpdatedAt: Date.now(),
                  });
                  return updated;
                });
              }
            } catch (err) {
              handleError(err);
            }
          })
          .subscribe((status) => {
            if (DEV_MODE) {
              console.log('📡 Cursor tracking channel status:', status);
            }

            switch (status) {
              case 'CHANNEL_ERROR':
                handleError('❌ Cursor tracking channel error');
                break;
              case 'TIMED_OUT':
                handleError('❌ Cursor tracking timed out');
                break;
              case 'SUBSCRIBED':
                // Reset error count on successful subscription
                errorCountRef.current = 0;
                break;
            }
          });

        // Set up mouse move handler if containerRef is provided
        if (containerRef?.current) {
          container = containerRef.current;

          handleMouseMove = (event: MouseEvent) => {
            const rect = container!.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            broadcastCursor(x, y, {
              id: user.id,
              display_name: userData?.display_name,
            });
          };

          handleMouseLeave = () => {
            // Broadcast cursor position outside the container to hide it
            broadcastCursor(-1000, -1000, {
              id: user.id,
              display_name: userData?.display_name,
            });
          };

          container.addEventListener('mousemove', handleMouseMove);
          container.addEventListener('mouseleave', handleMouseLeave);
        }
      } catch (err) {
        handleError(err);
      }
    };

    setupCursorTracking();

    return () => {
      isCleanedUpRef.current = true;

      // Clear any pending throttled broadcasts
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }

      // Broadcast cursor removal before unsubscribing (best effort)
      // This helps other users see the cursor disappear immediately
      if (channelRef.current && currentUserId) {
        try {
          channelRef.current.send({
            type: 'broadcast',
            event: 'cursor-move',
            payload: {
              x: -1000,
              y: -1000,
              user: { id: currentUserId },
            },
          });
        } catch (err) {
          // Ignore errors during cleanup
          if (DEV_MODE) {
            console.warn('Cursor cleanup broadcast error:', err);
          }
        }
      }

      // Remove channel subscription
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      // Clean up event listeners
      if (container && handleMouseMove && handleMouseLeave) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }

      // Clear state on unmount
      setCursors(new Map());
      setCurrentUserId(undefined);
      setError(false);
      errorCountRef.current = 0;
    };
  }, [
    channelName,
    containerRef, // Broadcast cursor position outside the container to hide it
    broadcastCursor,
  ]);

  return {
    cursors,
    currentUserId,
    error,
  };
}
