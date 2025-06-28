import type { Message } from '@tuturuuu/ai/types';
import { createClient } from '@tuturuuu/supabase/next/client';
import { useCallback, useEffect, useState } from 'react';

export function useMessages(
  chatId: string,
  messages: Message[],
  // eslint-disable-next-line no-unused-vars
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void
) {
  const [hasAccess, setHasAccess] = useState(false);

  // Function to check chat access
  const checkAccess = useCallback(async () => {
    if (!chatId) return false;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    // Check if user is owner
    const { data: chat } = await supabase
      .from('ai_chats')
      .select('creator_id')
      .eq('id', chatId)
      .single();

    if (chat?.creator_id === user.id) {
      return true;
    }

    // Check if user is member
    const { data: membership } = await supabase
      .from('ai_chat_members')
      .select('*')
      .eq('chat_id', chatId)
      .eq('user_id', user.id)
      .single();

    return !!membership;
  }, [chatId]);

  // Function to add a new message from realtime updates
  const addMessage = useCallback(
    (message: Message) => {
      setMessages((prev: Message[]) => {
        // Don't add if message already exists
        if (prev.some((m) => m.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });
    },
    [setMessages]
  );

  // Function to update a message from realtime updates
  const updateMessage = useCallback(
    (updatedMessage: Message) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === updatedMessage.id ? updatedMessage : message
        )
      );
    },
    [setMessages]
  );

  useEffect(() => {
    if (!chatId) return;

    // Check access first
    checkAccess().then(setHasAccess);

    const supabase = createClient();

    // Subscribe to new message inserts
    const channel = supabase
      .channel(`messages_${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ai_chat_messages',
          filter: `chat_id=eq.${chatId}`,
        },
        async (payload) => {
          console.log('New message:', payload);
          const { new: newMessage } = payload;

          // Skip if message already exists in state
          if (messages.some((m) => m.id === newMessage.id)) {
            return;
          }

          // Fetch user data for the new message
          if (newMessage.creator_id) {
            const { data: userData } = await supabase
              .from('users')
              .select(
                'id, display_name, avatar_url, user_private_details(email)'
              )
              .eq('id', newMessage.creator_id)
              .single();

            if (userData) {
              const messageWithUser = {
                ...newMessage,
                role: newMessage.role.toLowerCase(),
                user: {
                  id: userData.id,
                  display_name: userData.display_name,
                  email: userData.user_private_details?.email,
                  avatar_url: userData.avatar_url,
                },
              } as unknown as Message;

              addMessage(messageWithUser);
            }
          } else {
            // For assistant messages or messages without creator_id
            addMessage({
              ...newMessage,
              role: newMessage.role.toLowerCase(),
            } as Message);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ai_chat_messages',
          filter: `chat_id=eq.${chatId}`,
        },
        async (payload) => {
          console.log('Updated message:', payload);
          const { new: updatedMessage } = payload;

          // Fetch user data for the updated message
          if (updatedMessage.creator_id) {
            const { data: userData } = await supabase
              .from('users')
              .select(
                'id, display_name, avatar_url, user_private_details(email)'
              )
              .eq('id', updatedMessage.creator_id)
              .single();

            if (userData) {
              const messageWithUser = {
                ...updatedMessage,
                role: updatedMessage.role.toLowerCase(),
                user: {
                  id: userData.id,
                  display_name: userData.display_name,
                  email: userData.user_private_details?.email,
                  avatar_url: userData.avatar_url,
                },
              } as unknown as Message;

              updateMessage(messageWithUser);
            }
          } else {
            // For assistant messages or messages without creator_id
            updateMessage({
              ...updatedMessage,
              role: updatedMessage.role.toLowerCase(),
            } as Message);
          }
        }
      );

    // Also subscribe to membership changes to update access
    const membershipChannel = supabase.channel(`membership_${chatId}`).on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'ai_chat_members',
        filter: `chat_id=eq.${chatId}`,
      },
      async () => {
        // Recheck access when membership changes
        const newHasAccess = await checkAccess();
        setHasAccess(newHasAccess);
      }
    );

    // Subscribe to both channels
    Promise.all([channel.subscribe(), membershipChannel.subscribe()]);

    return () => {
      channel.unsubscribe();
      membershipChannel.unsubscribe();
    };
  }, [chatId, messages, addMessage, updateMessage, checkAccess]);

  return {
    hasAccess,
  };
}
