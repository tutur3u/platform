import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useEffect, useRef, useState } from 'react';

export interface UserPresenceState {
  user: User;
  online_at: string;
  /** Optional metadata for context-specific presence tracking */
  metadata?: Record<string, any>;
}

export function usePresence(
  channelName: string,
  metadata?: Record<string, any>
) {
  const [presenceState, setPresenceState] = useState<
    RealtimePresenceState<UserPresenceState>
  >({});
  const [currentUserId, setCurrentUserId] = useState<string>();
  const channelRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const isCleanedUpRef = useRef(false);
  const metadataRef = useRef(metadata);
  const MAX_RETRIES = 3;

  // Update metadata ref when it changes
  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);

  // Update presence metadata when it changes
  useEffect(() => {
    const updateMetadata = async () => {
      if (!channelRef.current || !currentUserId || !metadata) return;

      try {
        const {
          data: { user },
        } = await createClient().auth.getUser();
        if (!user?.id) return;

        const { data: userData } = await createClient()
          .from('users')
          .select('display_name, avatar_url')
          .eq('id', user.id)
          .single();

        await channelRef.current.track({
          user: {
            id: user.id,
            display_name: userData?.display_name,
            email: user.email,
            avatar_url: userData?.avatar_url,
          },
          online_at: new Date().toISOString(),
          metadata: metadata,
        });
      } catch (error) {
        if (DEV_MODE) {
          console.error('Error updating presence metadata:', error);
        }
      }
    };

    updateMetadata();
  }, [metadata, currentUserId]);

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
          if (DEV_MODE) {
            console.error('Error fetching user data:', userDataError);
          }
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
            if (DEV_MODE) {
              console.log('👋 User joined:', key, newPresences);
            }
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            if (DEV_MODE) {
              console.log('👋 User left:', key, leftPresences);
            }
          })
          .subscribe(async (status) => {
            if (DEV_MODE) {
              console.log('📡 Channel status:', status);
            }

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
                  metadata: metadataRef.current,
                });

                if (DEV_MODE) {
                  console.log('Presence track status:', presenceTrackStatus);
                }

                if (
                  presenceTrackStatus === 'timed out' &&
                  !isCleanedUpRef.current
                ) {
                  if (DEV_MODE) {
                    console.warn('⚠️ Presence tracking timed out, retrying...');
                  }
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
                        metadata: metadataRef.current,
                      });
                    }
                  }, 1000);
                }

                // Reset retry count on success
                retryCountRef.current = 0;
                break;
              }
              case 'CHANNEL_ERROR':
                if (DEV_MODE) {
                  console.error('❌ Channel error, connection lost');
                }
                if (
                  retryCountRef.current < MAX_RETRIES &&
                  !isCleanedUpRef.current
                ) {
                  retryCountRef.current++;
                  if (DEV_MODE) {
                    console.log(
                      `Retrying presence setup (${retryCountRef.current}/${MAX_RETRIES})...`
                    );
                  }
                  setTimeout(() => {
                    setupPresence();
                  }, 2000 * retryCountRef.current); // Exponential backoff
                }
                break;
              case 'TIMED_OUT':
                if (DEV_MODE) {
                  console.warn('⚠️ Channel subscription timed out');
                }
                if (
                  retryCountRef.current < MAX_RETRIES &&
                  !isCleanedUpRef.current
                ) {
                  retryCountRef.current++;
                  if (DEV_MODE) {
                    console.log(
                      `Retrying presence setup (${retryCountRef.current}/${MAX_RETRIES})...`
                    );
                  }
                  setTimeout(() => {
                    setupPresence();
                  }, 2000 * retryCountRef.current); // Exponential backoff
                }
                break;
              case 'CLOSED':
                if (DEV_MODE) {
                  console.info('📡 Channel closed');
                }
                break;
              default:
                if (DEV_MODE) {
                  console.info('📡 Unknown channel status:', status);
                }
                break;
            }
          });
      } catch (error) {
        if (DEV_MODE) {
          console.error('Error setting up board presence:', error);
        }
        if (retryCountRef.current < MAX_RETRIES && !isCleanedUpRef.current) {
          retryCountRef.current++;
          if (DEV_MODE) {
            console.log(
              `Retrying presence setup (${retryCountRef.current}/${MAX_RETRIES})...`
            );
          }
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
