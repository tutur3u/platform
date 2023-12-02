import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSecrets, getWorkspace } from '@/lib/workspace-helper';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Message } from 'ai';
import Chat from '../chat';
import { getChats } from '../page';
import { AIChat } from '@/types/primitives/ai-chat';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
    chatId?: string;
  };
}

export default async function AIPage({ params: { wsId, chatId } }: Props) {
  if (!chatId) notFound();

  const workspace = await getWorkspace(wsId);
  if (!workspace?.preset) notFound();

  const secrets = await getSecrets({
    wsId,
    requiredSecrets: ['ENABLE_CHAT'],
    forceAdmin: true,
  });

  const verifySecret = (secret: string, value: string) =>
    secrets.find((s) => s.name === secret)?.value === value;

  const enableChat = verifySecret('ENABLE_CHAT', 'true');
  if (!enableChat) redirect(`/${wsId}`);

  const messages = await getMessages(chatId);

  const chat = await getChat(chatId);
  const { data: chats, count } = await getChats();

  const hasKey = hasAnthropicKey();

  return (
    <Chat
      wsId={wsId}
      hasKey={hasKey}
      initialMessages={messages}
      defaultChat={chat}
      chats={chats}
      count={count}
    />
  );
}

const hasAnthropicKey = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  const hasKey = !!key && key.length > 0;
  return hasKey;
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

  const messages = data.map(({ role, ...rest }) => ({
    ...rest,
    role: role.toLowerCase(),
  })) as Message[];

  return messages;
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
