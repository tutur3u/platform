import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isCurrentUserAIWhitelisted } from '@/lib/ai-whitelist';
import Chat from './chat';
import { getChats } from './helper';

interface Props {
  searchParams: Promise<{
    lang: string;
  }>;
}

export default async function AIPage({ searchParams }: Props) {
  const { lang: locale } = await searchParams;
  const user = getAppSessionUserFromRequest(
    { headers: await headers() },
    { targetApp: 'rewise' }
  );
  if (!user?.email) redirect('/login');

  const { data: chats, count } = await getChats(user);

  if (!(await isCurrentUserAIWhitelisted())) redirect('/not-whitelisted');

  return <Chat chats={chats} count={count} locale={locale} />;
}
