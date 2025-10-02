import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import { useEffect, useRef, useState } from 'react';

export interface BoardPresenceState {
  user: User;
  online_at: string;
}

export function useBoardPresence(boardId?: string) {
  const [presenceState, setPresenceState] = useState<
    RealtimePresenceState<BoardPresenceState>
  >({});
  const [currentUserId, setCurrentUserId] = useState<string>();
  const channelRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  useEffect(() => {
    if (!boardId) return;

    const supabase = createClient();
    let isCleanedUp = false;

    const setupPresence = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id || isCleanedUp) return;

        const { data: userData } = await supabase
          .from('users')
          .select('display_name, avatar_url')
          .eq('id', user.id)
          .single();

        if (isCleanedUp) return;

        setCurrentUserId(user.id);

        // Clean up existing channel before creating a new one
        if (channelRef.current) {
          await supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        const channel = supabase.channel(`board_presence_${boardId}`, {
          config: {
            presence: {
              key: user.id,
              enabled: true,
            },
          },
        });

        channelRef.current = channel;

        channel
          .on('presence', { event: 'sync' }, () => {
            if (!isCleanedUp) {
              const newState =
                channel.presenceState() as RealtimePresenceState<BoardPresenceState>;
              setPresenceState({ ...newState });
            }
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            if (!isCleanedUp) {
              console.log('👋 User joined:', key, newPresences);
            }
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            if (!isCleanedUp) {
              console.log('👋 User left:', key, leftPresences);
            }
          })
          .subscribe(async (status) => {
            if (isCleanedUp) return;

            console.log('📡 Channel status:', status);

            switch (status) {
              case 'SUBSCRIBED': {
                const presenceTrackStatus = await channel.track({
                  user: {
                    id: user.id,
                    display_name: userData?.display_name,
                    email: user.email,
                    avatar_url: userData?.avatar_url,
                  },
                  online_at: new Date().toISOString(),
                });

                console.log('Presence track status:', presenceTrackStatus);

                if (presenceTrackStatus === 'timed out' && !isCleanedUp) {
                  console.warn('⚠️ Presence tracking timed out, retrying...');
                  // Retry once
                  setTimeout(async () => {
                    if (!isCleanedUp) {
                      await channel.track({
                        user: {
                          id: user.id,
                          display_name: userData?.display_name,
                          email: user.email,
                          avatar_url: userData?.avatar_url,
                        },
                        online_at: new Date().toISOString(),
                      });
                    }
                  }, 1000);
                }

                // Reset retry count on success
                retryCountRef.current = 0;
                break;
              }
              case 'CHANNEL_ERROR':
                console.error('❌ Channel error, connection lost');
                if (retryCountRef.current < MAX_RETRIES && !isCleanedUp) {
                  retryCountRef.current++;
                  console.log(
                    `Retrying presence setup (${retryCountRef.current}/${MAX_RETRIES})...`
                  );
                  setTimeout(() => {
                    if (!isCleanedUp) {
                      setupPresence();
                    }
                  }, 2000 * retryCountRef.current); // Exponential backoff
                }
                break;
              case 'TIMED_OUT':
                console.warn('⚠️ Channel subscription timed out');
                if (retryCountRef.current < MAX_RETRIES && !isCleanedUp) {
                  retryCountRef.current++;
                  console.log(
                    `Retrying presence setup (${retryCountRef.current}/${MAX_RETRIES})...`
                  );
                  setTimeout(() => {
                    if (!isCleanedUp) {
                      setupPresence();
                    }
                  }, 2000 * retryCountRef.current); // Exponential backoff
                }
                break;
              case 'CLOSED':
                console.info('📡 Channel closed');
                break;
              default:
                console.info('📡 Unknown channel status:', status);
                break;
            }
          });
      } catch (error) {
        console.error('Error setting up board presence:', error);
        if (retryCountRef.current < MAX_RETRIES && !isCleanedUp) {
          retryCountRef.current++;
          console.log(
            `Retrying presence setup (${retryCountRef.current}/${MAX_RETRIES})...`
          );
          setTimeout(() => {
            if (!isCleanedUp) {
              setupPresence();
            }
          }, 2000 * retryCountRef.current);
        }
      }
    };

    setupPresence();

    return () => {
      isCleanedUp = true;
      retryCountRef.current = 0;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [boardId]);

  return {
    presenceState,
    currentUserId,
  };
}
