import {
  getPermissions,
  getWorkspace,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import Chat from './chat';
import { getChats } from './helper';

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
      locale={locale}
    />
  );
}

const hasKey = (key: string) => {
  const keyEnv = process.env[key];
  return !!keyEnv && keyEnv.length > 0;
};
