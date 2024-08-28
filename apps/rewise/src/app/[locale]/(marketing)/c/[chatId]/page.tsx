import Chat from '../../chat';
import { getChats } from '../../helper';
import { AIChat } from '@/types/db';
import { createClient } from '@/utils/supabase/server';
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
  const messages = await getMessages(chatId);

  const chat = await getChat(chatId);
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

const getMessages = async (chatId: string) => {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('*')
    .eq('chat_id', chatId)
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
  const supabase = createClient();

  const { data, error } = await supabase
    .from('ai_chats')
    .select('*')
    .eq('id', chatId)
    .single();

  if (error) {
    console.error(error);
    notFound();
  }

  return data as AIChat;
};
