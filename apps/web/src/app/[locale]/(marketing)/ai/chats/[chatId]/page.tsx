import Chat from '@/app/[locale]/(dashboard)/[wsId]/chat/chat';
import { type Message } from '@repo/ai/types';
import { createAdminClient } from '@repo/supabase/next/server';
import { AIChat } from '@repo/types/db';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    chatId?: string;
  }>;
  searchParams: Promise<{
    lang: string;
  }>;
}

export default async function AIPage({ params, searchParams }: Props) {
  const { wsId, chatId } = await params;
  if (!chatId) notFound();

  const { lang: locale } = await searchParams;

  const chat = await getChat(chatId);
  const messages = await getMessages(chatId);

  const hasKeys = {
    openAI: hasKey('OPENAI_API_KEY'),
    anthropic: hasKey('ANTHROPIC_API_KEY'),
    google: hasKey('GOOGLE_GENERATIVE_AI_API_KEY'),
  };

  return (
    <div className="h-full p-4 lg:p-0">
      <Chat
        wsId={wsId}
        hasKeys={hasKeys}
        initialMessages={messages}
        defaultChat={chat}
        locale={locale}
      />
    </div>
  );
}

const hasKey = (key: string) => {
  const keyEnv = process.env[key];
  return !!keyEnv && keyEnv.length > 0;
};

const getMessages = async (chatId: string) => {
  const supabase = await createAdminClient();

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
  const supabase = await createAdminClient();

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
