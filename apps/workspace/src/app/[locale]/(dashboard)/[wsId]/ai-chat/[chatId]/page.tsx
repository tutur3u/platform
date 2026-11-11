import type { UIMessage } from '@tuturuuu/ai/types';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { AIChat } from '@tuturuuu/types';
import {
  getPermissions,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Chat from '../chat';
import { getChats } from '../helper';

export const metadata: Metadata = {
  title: 'Chat Details',
  description:
    'Manage Chat Details in the Chat area of your Tuturuuu workspace.',
};

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
  const hasSecrets = await verifyHasSecrets(wsId, ['ENABLE_CHAT']);
  if (!hasSecrets) redirect(`/${wsId}`);
  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;

  if (withoutPermission('ai_chat')) notFound();
  if (!chatId) notFound();

  const { lang: locale } = await searchParams;
  const messages = await getMessages(chatId);

  const chat = await getChat(chatId);
  const { data: chats, count } = await getChats();

  const hasKeys = {
    openAI: hasKey('OPENAI_API_KEY'),
    anthropic: hasKey('ANTHROPIC_API_KEY'),
    google: hasKey('GOOGLE_GENERATIVE_AI_API_KEY'),
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
  const supabase = await createClient();

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
    parts: [{ type: 'text', text: rest.content || '' }],
  })) as UIMessage[];
};

const getChat = async (chatId: string) => {
  const supabase = await createClient();

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
