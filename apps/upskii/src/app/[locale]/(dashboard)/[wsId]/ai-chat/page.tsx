import Chat from './chat';
import { getChats } from './helper';
import { getFeatureFlags } from '@/constants/secrets';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

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
  const { lang: locale } = await searchParams;
  const { data: chats, count } = await getChats();

  const cookieStore = await cookies();
  const apiKey = cookieStore.get('google_api_key')?.value;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { ENABLE_AI } = await getFeatureFlags(wsId);
  if (!ENABLE_AI) redirect(`/${wsId}/home`);

  return (
    <Chat
      chats={chats}
      count={count}
      locale={locale}
      initialApiKey={apiKey}
      user={user}
    />
  );
}
