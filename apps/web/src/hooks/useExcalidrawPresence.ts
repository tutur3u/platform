import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UserPresenceState {
  user: User;
  online_at: string;
}

export interface CurrentUserInfo {
  id: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
}

export interface UseExcalidrawPresenceConfig {
  channelName: string;
  currentUser: CurrentUserInfo;
  enabled?: boolean;
  onError?: (error: Error) => void;
}

export interface UseExcalidrawPresenceResult {
  // State
  presenceState: RealtimePresenceState<UserPresenceState>;
  isConnected: boolean;

  // Actions
  disconnect: () => void;
}

/**
 * Hook for managing user presence in Excalidraw whiteboards
 * Tracks which users are currently online and broadcasts current user's presence
 */
export function useExcalidrawPresence({
  channelName,
  currentUser,
  enabled = true,
  onError,
}: UseExcalidrawPresenceConfig): UseExcalidrawPresenceResult {
  const [presenceState, setPresenceState] = useState<
    RealtimePresenceState<UserPresenceState>
  >({});
  const [isConnected, setIsConnected] = useState(false);

  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>['channel']
  > | null>(null);
  const isCleanedUpRef = useRef(false);

  // Set up presence tracking
  useEffect(() => {
    if (!enabled || !currentUser.id) return;

    isCleanedUpRef.current = false;
    const supabase = createClient();

    const setupPresence = async () => {
      if (isCleanedUpRef.current) return;

      try {
        // Clean up existing channel
        if (channelRef.current) {
          await supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        const channel = supabase.channel(`${channelName}-presence`, {
          config: {
            presence: {
              key: currentUser.id,
              enabled: true,
            },
          },
        });

        channelRef.current = channel;

        channel
          .on('presence', { event: 'sync' }, () => {
            const newState =
              channel.presenceState() as RealtimePresenceState<UserPresenceState>;
            setPresenceState({ ...newState });
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            if (DEV_MODE) {
              console.log('Collaborator joined:', key, newPresences);
            }
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            if (DEV_MODE) {
              console.log('Collaborator left:', key, leftPresences);
            }
          })
          .subscribe(async (status) => {
            if (DEV_MODE) {
              console.log('Presence channel status:', status);
            }

            switch (status) {
              case 'SUBSCRIBED': {
                setIsConnected(true);

                await channel.track({
                  user: {
                    id: currentUser.id,
                    display_name: currentUser.displayName,
                    email: currentUser.email,
                    avatar_url: currentUser.avatarUrl,
                  },
                  online_at: new Date().toISOString(),
                });
                break;
              }
              case 'CHANNEL_ERROR':
              case 'TIMED_OUT':
                setIsConnected(false);
                if (onError) {
                  onError(
                    new Error(`Presence channel ${status.toLowerCase()}`)
                  );
                }
                break;
              case 'CLOSED':
                setIsConnected(false);
                break;
            }
          });
      } catch (error) {
        if (DEV_MODE) {
          console.error('Error setting up whiteboard presence:', error);
        }
        if (onError && error instanceof Error) {
          onError(error);
        }
      }
    };

    setupPresence();

    return () => {
      isCleanedUpRef.current = true;

      if (channelRef.current) {
        const supabase = createClient();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [channelName, currentUser, enabled, onError]);

  // Disconnect function
  const disconnect = useCallback(() => {
    if (channelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsConnected(false);
  }, []);

  return {
    presenceState,
    isConnected,
    disconnect,
  };
}
