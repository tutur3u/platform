import Chat from '../../chat';
import { getChats } from '../../helper';
import { AIChat } from '@/types/db';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import { Message } from 'ai';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    chatId?: string;
  }>;
  searchParams: Promise<{
    lang: string;
  }>;
}

export default async function AIPage({ params, searchParams }: Props) {
  const chatId = (await params).chatId;
  if (!chatId) notFound();

  const { lang: locale } = await searchParams;
  const chat = await getChat(chatId);
  const messages = await getMessages(chatId, chat.creator_id || '');
  const { data: chats, count } = await getChats();

  return (
    <Chat
      initialMessages={messages}
      defaultChat={chat}
      chats={chats}
      count={count}
      locale={locale}
    />
  );
}

const getMessages = async (chatId: string, creatorId: string) => {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get messages based on access
  const { data: messages, error: messagesError } =
    user?.id === creatorId
      ? await supabase
          .from('ai_chat_messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at')
      : await sbAdmin
          .from('ai_chat_messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at');

  if (messagesError) {
    console.error(messagesError);
    return [];
  }

  // Get user data for all unique creator_ids
  const uniqueCreatorIds = [
    ...new Set(messages.map((msg) => msg.creator_id)),
  ].filter(Boolean);
  const { data: users, error: usersError } = await sbAdmin
    .from('users')
    .select('id, display_name, avatar_url, user_private_details(email)')
    .in('id', uniqueCreatorIds);

  if (usersError) {
    console.error(usersError);
    return [];
  }

  // Create a map of user data
  const userMap = new Map(
    users?.map((user) => [
      user.id,
      {
        id: user.id,
        email: user.user_private_data?.email,
        display_name: user?.display_name,
        avatar_url: user?.avatar_url,
      },
    ])
  );

  // Map messages with user data
  return messages.map(({ role, creator_id, ...rest }) => ({
    ...rest,
    role: role.toLowerCase(),
    user: creator_id ? userMap.get(creator_id) : undefined,
  })) as Message[];
};

const getChat = async (chatId: string) => {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // First try to get the chat as the current user
  const { data: userChat, error: userError } = await supabase
    .from('ai_chats')
    .select('*')
    .eq('id', chatId)
    .single();

  // If the user owns the chat, return it
  if (!userError && userChat && userChat.creator_id === user?.id) {
    return userChat as AIChat;
  }

  // If not the owner, check if the chat is public using admin client
  const { data: adminChat, error: adminError } = await sbAdmin
    .from('ai_chats')
    .select('*')
    .eq('id', chatId)
    .eq('is_public', true)
    .single();

  if (!adminError && adminChat) {
    return adminChat as AIChat;
  }

  // If neither condition is met, the user doesn't have access
  notFound();
};
