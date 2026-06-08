import type { UIMessage } from '@tuturuuu/ai/types';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { AIChat } from '@tuturuuu/types';
import { notFound, redirect } from 'next/navigation';
import { isCurrentUserAIWhitelisted } from '@/lib/ai-whitelist';
import Chat from '../../chat';
import { getChats } from '../../helper';

interface Props {
  params: Promise<{
    chatId?: string;
  }>;
  searchParams: Promise<{
    lang: string;
  }>;
}

export default async function AIPage({ params, searchParams }: Props) {
  const { chatId } = await params;
  if (!chatId) notFound();

  const { lang: locale } = await searchParams;

  // Check if user is whitelisted
  const user = await getSatelliteAppSessionUser('rewise');
  if (!user?.email) redirect('/login');

  if (!(await isCurrentUserAIWhitelisted())) redirect('/not-whitelisted');

  // Get chat data
  const chat = await getChat(chatId, user);
  const messages = await getMessages(chatId, user);
  const { data: chats, count } = await getChats(user);

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

const getMessages = async (
  chatId: string,
  user: Pick<SupabaseUser, 'email' | 'id'>
) => {
  const sbAdmin = await createAdminClient({ noCookie: true });

  const { data: chat } = await sbAdmin
    .from('ai_chats')
    .select('creator_id, is_public')
    .eq('id', chatId)
    .maybeSingle();

  if (!chat) {
    return [];
  }

  const canRead = chat.creator_id === user.id || chat.is_public;

  if (!canRead) {
    return [];
  }

  const { data: messages, error } = await sbAdmin
    .from('ai_chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at');

  if (!error && messages) {
    return formatMessages(messages, await getMessageUsers(messages));
  }

  return [];
};

// Helper function to get user data for messages
const getMessageUsers = async (messages: any[]) => {
  const sbAdmin = await createAdminClient({ noCookie: true });

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
    return new Map();
  }

  // Create a map of user data
  return new Map(
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
const formatMessages = (messages: any[], userMap: Map<string, any>) => {
  return messages.map(({ role, creator_id, content, ...rest }) => ({
    ...rest,
    role: role.toLowerCase(),
    parts: [{ type: 'text', text: content }],
    user: creator_id ? userMap.get(creator_id) : undefined,
  })) as UIMessage[];
};

const getChat = async (
  chatId: string,
  user: Pick<SupabaseUser, 'email' | 'id'>
) => {
  const sbAdmin = await createAdminClient({ noCookie: true });

  const { data: chat, error } = await sbAdmin
    .from('ai_chats')
    .select('*')
    .eq('id', chatId)
    .maybeSingle();

  if (error || !chat) {
    notFound();
  }

  if (chat.creator_id === user.id || chat.is_public) {
    return chat as AIChat;
  }

  // If neither condition is met, the user doesn't have access
  notFound();
};
