import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSecrets, getWorkspace } from '@/lib/workspace-helper';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import Chat from './chat';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function AIPage({ params: { wsId } }: Props) {
  const workspace = await getWorkspace(wsId);
  if (!workspace?.preset) notFound();

  const secrets = await getSecrets(wsId, ['ENABLE_CHAT'], true);

  const verifySecret = (secret: string, value: string) =>
    secrets.find((s) => s.name === secret)?.value === value;

  const enableChat = verifySecret('ENABLE_CHAT', 'true');
  if (!enableChat) redirect(`/${wsId}`);

  const { data: chats, count } = await getChats();
  const hasKey = hasAnthropicKey();

  return <Chat wsId={wsId} hasKey={hasKey} chats={chats} count={count} />;
}

const hasAnthropicKey = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  const hasKey = !!key && key.length > 0;
  return hasKey;
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
