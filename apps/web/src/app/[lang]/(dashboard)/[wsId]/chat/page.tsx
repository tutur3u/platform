import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSecrets, getWorkspace } from '@/lib/workspace-helper';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import Chat from './chat';
import { Message } from 'ai';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    lang: string;
  };
}

export default async function AIPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { lang: locale } = searchParams;

  const workspace = await getWorkspace(wsId);
  if (!workspace?.preset) notFound();

  const secrets = await getSecrets(wsId, ['ENABLE_CHAT'], true);

  const verifySecret = (secret: string, value: string) =>
    secrets.find((s) => s.name === secret)?.value === value;

  const enableChat = verifySecret('ENABLE_CHAT', 'true');
  if (!enableChat) redirect(`/${wsId}`);

  const { data: chats, count } = await getChats();
  const messages = await getMessages();

  const hasKey = hasAnthropicKey();

  return (
    <Chat
      wsId={wsId}
      hasKey={hasKey}
      chats={chats}
      count={count}
      previousMessages={messages}
      locale={locale}
    />
  );
}

const hasAnthropicKey = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  const hasKey = !!key && key.length > 0;
  return hasKey;
};

const getMessages = async () => {
  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2);

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

export const getChats = async () => {
  const supabase = createServerComponentClient({ cookies });

  const { data, count, error } = await supabase
    .from('ai_chats')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return { data: [], count: 0 };
  }

  return { data, count };
};
