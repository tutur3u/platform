import { redirect } from 'next/navigation';
import Chat from './chat';
import { getChats, requireRewiseWorkspace } from './helper';

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
      chats={chats}
      count={count}
      locale={locale}
      workspaceSlug={workspaceSlug}
      wsId={wsId}
    />
  );
}
