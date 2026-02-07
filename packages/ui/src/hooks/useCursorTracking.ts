import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimeChannel } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePageVisibility } from './use-page-visibility';

export interface CursorPosition {
  x: number;
  y: number;
  user?: User;
  metadata?: { [key: string]: any };
  lastUpdatedAt: number;
}

export function useCursorTracking(
  channelName: string,
  containerRef?: RefObject<HTMLElement | null>,
  user?: User,
  metadata?: { [key: string]: any }
) {
  const [cursors, setCursors] = useState<Map<string, CursorPosition>>(
    new Map()
  );
  const [error, setError] = useState<boolean>(false);
  const pageVisible = usePageVisibility();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isCleanedUpRef = useRef(false);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastBroadcastTimeRef = useRef<number>(0);
  const errorCountRef = useRef<number>(0);

  const targetPosition = useRef({ x: -1000, y: -1000 });
  const currentPosition = useRef({ x: -1000, y: -1000 });
  const animationFrameId = useRef<number | null>(null);

  const ANIMATION_FACTOR = 0.2;
  const THROTTLE_MS = 250; // Broadcast cursor position every 250ms max (4/sec)
  const MOVEMENT_THRESHOLD = 5; // Min px distance to trigger a broadcast
  const CURSOR_TIMEOUT = 5000; // Remove cursor if no update for 5 seconds
  const MAX_ERROR_COUNT = 3; // Disable after 3 consecutive errors

  const handleError = useCallback((err: any) => {
    errorCountRef.current++;
    if (errorCountRef.current >= MAX_ERROR_COUNT) {
      setError(true);
    }
    if (DEV_MODE) {
      console.warn('Error in cursor tracking:', err);
    }
  }, []);

  const broadcastCursor = useCallback(
    async (
      x: number,
      y: number,
      user: User,
      metadata?: { [key: string]: any }
    ) => {
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
                  payload: { x, y, user, metadata },
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
            payload: { x, y, user, metadata },
          });

          lastBroadcastTimeRef.current = now;
          // Reset error count on successful broadcast
          errorCountRef.current = 0;
        }
      } catch (err) {
        handleError(err);
      }
    },
    [handleError] // No dependencies - uses only refs
  );

  const pageVisibleRef = useRef(pageVisible);
  pageVisibleRef.current = pageVisible;

  const smoothAnimate = useCallback(() => {
    currentPosition.current.x +=
      (targetPosition.current.x - currentPosition.current.x) * ANIMATION_FACTOR;
    currentPosition.current.y +=
      (targetPosition.current.y - currentPosition.current.y) * ANIMATION_FACTOR;

    if (!user?.id) return;

    const distance = Math.hypot(
      targetPosition.current.x - currentPosition.current.x,
      targetPosition.current.y - currentPosition.current.y
    );

    // Only broadcast when the tab is visible and the cursor has moved enough
    // to avoid wasting broadcasts on animation tail or background tabs
    if (distance > MOVEMENT_THRESHOLD && pageVisibleRef.current) {
      broadcastCursor(
        currentPosition.current.x,
        currentPosition.current.y,
        user,
        metadata
      );
    }

    animationFrameId.current = requestAnimationFrame(smoothAnimate);
  }, [broadcastCursor, user, metadata]);

  useEffect(() => {
    animationFrameId.current = requestAnimationFrame(smoothAnimate);
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [smoothAnimate]);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!user?.id) return;

      const rect = containerRef?.current?.getBoundingClientRect();
      if (!rect) return;

      targetPosition.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    },
    [user, containerRef]
  );

  const handleMouseLeave = useCallback(() => {
    if (!user?.id) return;

    // Broadcast cursor position outside the container to hide it
    broadcastCursor(-1000, -1000, user, metadata);
  }, [user, metadata, broadcastCursor]);

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

    const setupCursorTracking = async () => {
      if (isCleanedUpRef.current) return;

      try {
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
              const {
                x,
                y,
                user: broadcastUser,
                metadata: broadcastMetadata,
              } = payload.payload;

              if (broadcastUser.id !== user?.id) {
                setCursors((prev) => {
                  const updated = new Map(prev);
                  updated.set(broadcastUser.id || '', {
                    x,
                    y,
                    user: broadcastUser,
                    metadata: broadcastMetadata,
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
      if (channelRef.current && user?.id) {
        try {
          channelRef.current.send({
            type: 'broadcast',
            event: 'cursor-move',
            payload: {
              x: -1000,
              y: -1000,
              user,
              metadata,
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
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [
    channelName,
    containerRef,
    user,
    metadata,
    handleError,
    handleMouseMove,
    handleMouseLeave,
  ]);

  return {
    cursors,
    error,
  };
}
