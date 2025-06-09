import Chat from './chat';
import { getChats } from './helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

interface Props {
  searchParams: Promise<{
    lang: string;
  }>;
}

export default async function AIPage({ searchParams }: Props) {
  const { lang: locale } = await searchParams;
  const { data: chats, count } = await getChats();

  const cookieStore = await cookies();
  const apiKey = cookieStore.get('google_api_key')?.value;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

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
