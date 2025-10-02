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

  useEffect(() => {
    if (!boardId) return;

    const supabase = createClient();

    const setupPresence = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) return;

        const { data: userData } = await supabase
          .from('users')
          .select('display_name, avatar_url')
          .eq('id', user.id)
          .single();

        setCurrentUserId(user.id);

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
            const newState =
              channel.presenceState() as RealtimePresenceState<BoardPresenceState>;
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

                if (presenceTrackStatus === 'timed out') {
                  console.warn('⚠️ Presence tracking timed out, retrying...');
                  // Retry once
                  setTimeout(async () => {
                    await channel.track({
                      user: {
                        id: user.id,
                        display_name: userData?.display_name,
                        email: user.email,
                        avatar_url: userData?.avatar_url,
                      },
                      online_at: new Date().toISOString(),
                    });
                  }, 1000);
                }

                break;
              }
              case 'CHANNEL_ERROR':
                console.error('❌ Channel error, connection lost');
                break;
              case 'TIMED_OUT':
                console.error('❌ Channel subscription timed out');
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
      }
    };

    setupPresence();

    return () => {
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
