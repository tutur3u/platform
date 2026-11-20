import type { UIMessage } from '@tuturuuu/ai/types';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Chat from '../chat';
import { listOwnedChats } from '../helper';

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
  const { user } = await resolveAuthenticatedSessionUser(await createClient());
  if (!user) notFound();

  const admin = await createAdminClient({ noCookie: true });
  const { data: chat, error } = await admin
    .from('ai_chats')
    .select('*')
    .eq('id', chatId)
    .eq('creator_id', user.id)
    .maybeSingle();
  if (error || !chat) notFound();

  const messages = await getMessages(admin, chatId, user.id);
  const { data: chats, count } = await listOwnedChats(user.id);

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

const getMessages = async (
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  chatId: string,
  userId: string
) => {
  const { data, error } = await admin
    .from('ai_chat_messages')
    .select('id, role, content, metadata, ai_chats!chat_id!inner(creator_id)')
    .eq('chat_id', chatId)
    .eq('ai_chats.creator_id', userId)
    .order('created_at');

  if (error) {
    console.error(error);
    return [];
  }

  return data.map(({ id, role, content, metadata }) => ({
    id,
    metadata,
    role: role.toLowerCase(),
    parts: [{ type: 'text', text: content || '' }],
  })) as UIMessage[];
};
