import Chat from './chat';
import { getChats } from './helper';
import {
  getPermissions,
  getWorkspace,
  verifyHasSecrets,
} from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';
import { Message } from 'ai';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    lang: string;
  }>;
}

export default async function AIPage({ params, searchParams }: Props) {
  const { wsId } = await params;
  await verifyHasSecrets(wsId, ['ENABLE_CHAT'], `/${wsId}`);
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('ai_chat')) notFound();

  const { lang: locale } = await searchParams;
  const workspace = await getWorkspace(wsId);

  if (!workspace) notFound();

  const { data: chats, count } = await getChats();
  const messages = await getMessages();

  const hasKeys = {
    openAI: hasKey('OPENAI_API_KEY'),
    anthropic: hasKey('ANTHROPIC_API_KEY'),
    google: hasKey('GOOGLE_GENERATIVE_AI_API_KEY'),
  };

  return (
    <Chat
      wsId={wsId}
      hasKeys={hasKeys}
      chats={chats}
      count={count}
      previousMessages={messages}
      locale={locale}
    />
  );
}

const hasKey = (key: string) => {
  const keyEnv = process.env[key];
  return !!keyEnv && keyEnv.length > 0;
};

const getMessages = async () => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('*, ai_chats!chat_id(*)')
    .order('created_at', { ascending: false })
    .limit(2);

  if (error) {
    console.error(error);
    return [];
  }

  return data.map(({ role, ...rest }) => ({
    ...rest,
    role: role.toLowerCase(),
  })) as Message[];
};
