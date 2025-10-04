import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import { useEffect, useRef, useState } from 'react';

export interface UserPresenceState {
  user: User;
  online_at: string;
}

export function usePresence(channelName: string) {
  const [presenceState, setPresenceState] = useState<
    RealtimePresenceState<UserPresenceState>
  >({});
  const [currentUserId, setCurrentUserId] = useState<string>();
  const channelRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const isCleanedUpRef = useRef(false);
  const MAX_RETRIES = 3;

  useEffect(() => {
    if (!channelName) return;
    isCleanedUpRef.current = false;

    const supabase = createClient();

    const setupPresence = async () => {
      if (isCleanedUpRef.current) return;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) return;

        const { data: userData, error: userDataError } = await supabase
          .from('users')
          .select('display_name, avatar_url')
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
            presence: {
              key: user.id,
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
            console.log('👋 User joined:', key, newPresences);
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('👋 User left:', key, leftPresences);
          })
          .subscribe(async (status) => {
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

                if (
                  presenceTrackStatus === 'timed out' &&
                  !isCleanedUpRef.current
                ) {
                  console.warn('⚠️ Presence tracking timed out, retrying...');
                  // Retry once
                  setTimeout(async () => {
                    if (!isCleanedUpRef.current) {
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
                if (
                  retryCountRef.current < MAX_RETRIES &&
                  !isCleanedUpRef.current
                ) {
                  retryCountRef.current++;
                  console.log(
                    `Retrying presence setup (${retryCountRef.current}/${MAX_RETRIES})...`
                  );
                  setTimeout(() => {
                    setupPresence();
                  }, 2000 * retryCountRef.current); // Exponential backoff
                }
                break;
              case 'TIMED_OUT':
                console.warn('⚠️ Channel subscription timed out');
                if (
                  retryCountRef.current < MAX_RETRIES &&
                  !isCleanedUpRef.current
                ) {
                  retryCountRef.current++;
                  console.log(
                    `Retrying presence setup (${retryCountRef.current}/${MAX_RETRIES})...`
                  );
                  setTimeout(() => {
                    setupPresence();
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
        if (retryCountRef.current < MAX_RETRIES && !isCleanedUpRef.current) {
          retryCountRef.current++;
          console.log(
            `Retrying presence setup (${retryCountRef.current}/${MAX_RETRIES})...`
          );
          setTimeout(() => {
            setupPresence();
          }, 2000 * retryCountRef.current);
        }
      }
    };

    setupPresence();

    return () => {
      isCleanedUpRef.current = true;
      retryCountRef.current = 0;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [channelName]);

  return {
    presenceState,
    currentUserId,
  };
}
