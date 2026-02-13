import {
  getPermissions,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import Chat from './chat';
import { getChats } from './helper';

export const metadata: Metadata = {
  title: 'Chat',
  description: 'Manage Chat in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    lang: string;
  }>;
}

export default async function AIPage({ params, searchParams }: Props) {
  const { lang: locale } = await searchParams;

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const hasSecrets = await verifyHasSecrets(wsId, ['ENABLE_CHAT']);
        if (!hasSecrets) redirect(`/${wsId}`);

        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { withoutPermission } = permissions;

        if (withoutPermission('ai_chat')) notFound();

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
      }}
    </WorkspaceWrapper>
  );
}

const hasKey = (key: string) => {
  const keyEnv = process.env[key];
  return !!keyEnv && keyEnv.length > 0;
};
