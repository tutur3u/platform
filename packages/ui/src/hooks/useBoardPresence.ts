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
    const setupPresence = async () => {
      try {
        const supabase = createClient();
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

        // Set up presence listeners
        channel
          .on('presence', { event: 'sync' }, () => {
            const newState =
              channel.presenceState() as RealtimePresenceState<BoardPresenceState>;
            setPresenceState({ ...newState });
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('User joined board:', key, newPresences);
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('User left board:', key, leftPresences);
          });

        channelRef.current = channel;

        // Subscribe and track presence
        try {
          channel.subscribe(async (status) => {
            if (status !== 'SUBSCRIBED') return;

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
          });
        } catch (error) {
          console.error('Error subscribing to board presence channel:', error);
        }
      } catch (error) {
        console.error('Error setting up board presence:', error);
      }
    };

    setupPresence();

    return () => {
      if (channelRef.current) {
        channelRef.current.untrack();
        channelRef.current.unsubscribe();
      }
    };
  }, [boardId]);

  return {
    presenceState,
    currentUserId,
  };
}
