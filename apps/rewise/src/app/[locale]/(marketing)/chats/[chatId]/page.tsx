import Chat from '../../chat';
import { AIChat } from '@/types/db';
import { createAdminClient } from '@/utils/supabase/server';
import { Message } from 'ai';
import { notFound } from 'next/navigation';

interface Props {
  params: {
    chatId?: string;
  };
  searchParams: {
    lang: string;
  };
}

export default async function AIPage({
  params: { chatId },
  searchParams,
}: Props) {
  if (!chatId) notFound();

  const { lang: locale } = searchParams;

  const chat = await getChat(chatId);
  const messages = await getMessages(chatId);

  return (
    <div className="h-full p-4 lg:p-0">
      <Chat initialMessages={messages} defaultChat={chat} locale={locale} />
    </div>
  );
}

const getMessages = async (chatId: string) => {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('*, ai_chats!chat_id!inner(is_public)')
    .eq('chat_id', chatId)
    .eq('ai_chats.is_public', true)
    .order('created_at');

  if (error) {
    console.error(error);
    return [];
  }

  return data.map(({ role, ...rest }) => ({
    ...rest,
    role: role.toLowerCase(),
  })) as Message[];
};

const getChat = async (chatId: string) => {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('ai_chats')
    .select('*')
    .eq('id', chatId)
    .eq('is_public', true)
    .single();

  if (error) {
    console.error(error);
    notFound();
  }

  return data as AIChat;
};
