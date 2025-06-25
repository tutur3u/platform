import type { Message } from '@tuturuuu/ai/types';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { AIChat, Tables } from '@tuturuuu/types/db';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { notFound, redirect } from 'next/navigation';
import Chat from '../../chat';
import { getChats } from '../../helper';

// Define proper types for AI chat messages and user data
type AIChatMessage = Tables<'ai_chat_messages'>;
type MessageUser = {
  id: string;
  email?: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

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

  // Check if user is whitelisted
  const user = await getCurrentUser();
  if (!user?.email) redirect('/login');

  const adminSb = await createAdminClient();
  const { data: whitelisted, error } = await adminSb
    .from('ai_whitelisted_emails')
    .select('enabled')
    .eq('email', user?.email)
    .maybeSingle();

  if (error || !whitelisted?.enabled) redirect('/not-whitelisted');

  // Get chat data
  const chat = await getChat(chatId);
  const messages = await getMessages(chatId);
  const { data: chats, count } = await getChats();

  return (
    <div className="h-full p-4 lg:p-0">
      <Chat
        initialMessages={messages}
        defaultChat={chat}
        chats={chats}
        count={count}
        locale={locale}
      />
    </div>
  );
}

const getMessages = async (chatId: string) => {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // First try to get messages as the current user
  const { data: userMessages, error: userError } = await supabase
    .from('ai_chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at');

  // If the user owns the chat, return messages
  const { data: chat } = await supabase
    .from('ai_chats')
    .select('creator_id')
    .eq('id', chatId)
    .single();

  if (!userError && userMessages && chat?.creator_id === user?.id) {
    return formatMessages(userMessages, await getMessageUsers(userMessages));
  }

  // Check if user's email is in ai_chat_members
  if (user?.email) {
    const { data: membership } = await supabase
      .from('ai_chat_members')
      .select('*')
      .eq('chat_id', chatId)
      .eq('email', user.email)
      .single();

    if (membership) {
      // User is a member, use admin client to get messages
      const { data: adminMessages, error: adminError } = await sbAdmin
        .from('ai_chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at');

      if (!adminError && adminMessages) {
        return formatMessages(
          adminMessages,
          await getMessageUsers(adminMessages)
        );
      }
    }
  }

  // If not a member, check if the chat is public
  const { data: publicChat } = await sbAdmin
    .from('ai_chats')
    .select('*')
    .eq('id', chatId)
    .eq('is_public', true)
    .single();

  if (publicChat) {
    // Chat is public, get messages using admin client
    const { data: publicMessages, error: publicError } = await sbAdmin
      .from('ai_chat_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at');

    if (!publicError && publicMessages) {
      return formatMessages(
        publicMessages,
        await getMessageUsers(publicMessages)
      );
    }
  }

  return [];
};

// Helper function to get user data for messages
const getMessageUsers = async (messages: AIChatMessage[]) => {
  const sbAdmin = await createAdminClient();

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
    return new Map<string, MessageUser>();
  }

  // Create a map of user data
  return new Map<string, MessageUser>(
    users?.map((user) => [
      user.id,
      {
        id: user.id,
        email: user.user_private_details?.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
      },
    ])
  );
};

// Helper function to format messages with user data
const formatMessages = (
  messages: AIChatMessage[],
  userMap: Map<string, MessageUser>
) => {
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

  // Check if user's email is in ai_chat_members
  if (user?.email) {
    const { data: membership } = await supabase
      .from('ai_chat_members')
      .select('*')
      .eq('chat_id', chatId)
      .eq('email', user.email)
      .single();

    if (membership) {
      // User is a member, use admin client to get the chat
      const { data: adminChat, error: adminError } = await sbAdmin
        .from('ai_chats')
        .select('*')
        .eq('id', chatId)
        .single();

      if (!adminError && adminChat) {
        return adminChat as AIChat;
      }
    }
  }

  // If not a member, check if the chat is public using admin client
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
