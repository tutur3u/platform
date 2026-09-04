import type { AIModelUI } from '@tuturuuu/types';
import { redirect } from 'next/navigation';
import Chat from '../chat';
import { getChats, requireRewiseWorkspace } from '../helper';

const IMAGEN_MODEL: AIModelUI = {
  value: 'vertex/imagen-3.0-fast-generate-001',
  label: 'imagen-3.0-fast-generate-001',
  provider: 'vertex',
  disabled: true,
};

interface Props {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{
    lang: string;
  }>;
}

export default async function AIPage({ params, searchParams }: Props) {
  const { wsId: workspaceSlug } = await params;
  const { lang: locale } = await searchParams;
  const { user, wsId } = await requireRewiseWorkspace(workspaceSlug);
  if (!user?.email) redirect('/login');

  const { data: chats, count } = await getChats(user);

  return (
    <Chat
      inputModel={IMAGEN_MODEL}
      defaultChat={{
        model: IMAGEN_MODEL.value,
      }}
      chats={chats}
      count={count}
      locale={locale}
      wsId={wsId}
      noEmptyPage
      disabled
    />
  );
}
