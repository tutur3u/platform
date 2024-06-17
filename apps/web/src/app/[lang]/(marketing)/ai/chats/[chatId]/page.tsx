import Chat from '@/app/[lang]/(dashboard)/[wsId]/chat/chat';
import { AIChat } from '@/types/db';
import { createAdminClient } from '@/utils/supabase/client';
import { Message } from 'ai';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
    chatId?: string;
  };
  searchParams: {
    lang: string;
  };
}

export default async function AIPage({
  params: { wsId, chatId },
  searchParams,
}: Props) {
  if (!chatId) notFound();

  const { lang: locale } = searchParams;

  const chat = await getChat(chatId);
  const messages = await getMessages(chatId);

  const hasKeys = {
    openAI: hasKey('OPENAI_API_KEY'),
    anthropic: hasKey('ANTHROPIC_API_KEY'),
    google: hasKey('GOOGLE_API_KEY'),
  };

  return (
    <Chat
      wsId={wsId}
      hasKeys={hasKeys}
      initialMessages={messages}
      defaultChat={chat}
      locale={locale}
    />
  );
}

const hasKey = (key: string) => {
  const keyEnv = process.env[key];
  return !!keyEnv && keyEnv.length > 0;
};

const getMessages = async (chatId: string) => {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('*, ai_chats!inner(is_public)')
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
