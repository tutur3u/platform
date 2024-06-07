import Chat from '../chat';
import { getChats } from '../helper';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { AIChat } from '@/types/primitives/ai-chat';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Message } from 'ai';
import { cookies } from 'next/headers';
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
  await verifyHasSecrets(wsId, ['ENABLE_CHAT'], `/${wsId}`);
  if (!chatId) notFound();

  const { lang: locale } = searchParams;

  const messages = await getMessages(chatId);

  const chat = await getChat(chatId);
  const { data: chats, count } = await getChats();

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
      chats={chats}
      count={count}
      locale={locale}
    />
  );
}

const hasKey = (key: string) => {
  const keyEnv = process.env[key];
  return !!keyEnv && keyEnv.length > 0;
};

const getMessages = async (chatId: string) => {
  const supabase = createServerComponentClient({ cookies });

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
  const supabase = createServerComponentClient({ cookies });

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
