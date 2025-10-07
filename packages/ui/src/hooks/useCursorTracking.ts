import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimeChannel } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
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
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isCleanedUpRef = useRef(false);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastBroadcastTimeRef = useRef<number>(0);
  const THROTTLE_MS = 50; // Broadcast cursor position every 50ms max
  const CURSOR_TIMEOUT = 5000; // Remove cursor if no update for 5 seconds

  const broadcastCursor = useCallback(
    async (x: number, y: number, user: User) => {
      if (!channelRef.current) return;

      const now = Date.now();
      const timeSinceLastBroadcast = now - lastBroadcastTimeRef.current;
      if (timeSinceLastBroadcast < THROTTLE_MS) {
        // Throttle: schedule a broadcast for later if not already scheduled
        if (!throttleTimeoutRef.current) {
          throttleTimeoutRef.current = setTimeout(async () => {
            await channelRef.current?.send({
              type: 'broadcast',
              event: 'cursor-move',
              payload: { x, y, user },
            });

            lastBroadcastTimeRef.current = Date.now();
            throttleTimeoutRef.current = null;
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
      }
    },
    []
  );

  // Clean up stale cursors
  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!channelName) return;
    isCleanedUpRef.current = false;

    const supabase = createClient();

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
          console.error('Error fetching user data:', userDataError);
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
          })
          .subscribe((status) => {
            console.log('📡 Cursor tracking channel status:', status);

            if (status === 'SUBSCRIBED') {
              console.log('✅ Cursor tracking active');
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Cursor tracking channel error');
            }
          });

        // Set up mouse move handler if containerRef is provided
        if (containerRef?.current) {
          const container = containerRef.current;

          const handleMouseMove = (event: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            broadcastCursor(x, y, {
              id: user.id,
              display_name: userData?.display_name,
            });
          };

          const handleMouseLeave = () => {
            // Broadcast cursor position outside the container to hide it
            broadcastCursor(-1000, -1000, {
              id: user.id,
              display_name: userData?.display_name,
            });
          };

          container.addEventListener('mousemove', handleMouseMove);
          container.addEventListener('mouseleave', handleMouseLeave);

          return () => {
            container.removeEventListener('mousemove', handleMouseMove);
          };
        }
      } catch (error) {
        console.error('Error setting up cursor tracking:', error);
      }
    };

    setupCursorTracking();

    return () => {
      isCleanedUpRef.current = true;
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [channelName, containerRef, broadcastCursor]);

  return {
    cursors,
    currentUserId,
  };
}
