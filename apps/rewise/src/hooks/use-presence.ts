import { createClient } from '@tutur3u/supabase/next/client';
import { RealtimePresenceState } from '@tutur3u/supabase/next/realtime';
import { useEffect, useRef, useState } from 'react';

interface PresenceUser {
  id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

interface PresenceState {
  user: PresenceUser;
  online_at: string;
  presence_ref: string;
}

export function usePresence(chatId?: string) {
  const [presenceState, setPresenceState] = useState<
    RealtimePresenceState<PresenceState>
  >({});
  const [currentUserId, setCurrentUserId] = useState<string>();
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!chatId) return;

    const setupPresence = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        setCurrentUserId(user.id);

        const channel = supabase.channel(`presence_${chatId}`);

        // First set up all the listeners
        channel
          .on('presence', { event: 'sync' }, () => {
            const newState =
              channel.presenceState() as RealtimePresenceState<PresenceState>;
            console.log('Presence sync:', newState);
            setPresenceState(newState);
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('Presence join:', key, newPresences);
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('Presence leave:', key, leftPresences);
          });

        // Then subscribe to the channel
        try {
          await channel.subscribe();
          // Only track presence after successful subscription
          await channel.track({
            presence_ref: crypto.randomUUID(),
            user: {
              id: user.id,
              display_name: user.user_metadata?.display_name,
              email: user.email,
              avatar_url: user.user_metadata?.avatar_url,
            },
            online_at: new Date().toISOString(),
          });
          channelRef.current = channel;
        } catch (error) {
          console.error('Error subscribing to channel:', error);
        }
      } catch (error) {
        console.error('Error setting up presence:', error);
      }
    };

    setupPresence();

    return () => {
      if (channelRef.current) {
        channelRef.current.untrack();
        channelRef.current.unsubscribe();
      }
    };
  }, [chatId]);

  // Get all online users
  const onlineUsers = Object.values(presenceState).flatMap(
    (presence) => presence
  );

  // Get unique user IDs
  const uniqueUserIds = new Set(
    onlineUsers.map((presence) => presence.user.id)
  );

  // Show presence if there are any other users besides the current user
  const shouldShowPresence =
    uniqueUserIds.size > 1 ||
    (uniqueUserIds.size === 1 && !uniqueUserIds.has(currentUserId || ''));

  return {
    presenceState: shouldShowPresence ? presenceState : {},
    currentUserId,
  };
}
