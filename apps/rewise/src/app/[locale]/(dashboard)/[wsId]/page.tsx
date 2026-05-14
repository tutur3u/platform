import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
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

  const adminSb = await createAdminClient({ noCookie: true });

  const { data: whitelisted, error } = await adminSb
    .from('ai_whitelisted_emails')
    .select('enabled')
    .eq('email', user?.email)
    .maybeSingle();

  if (error || !whitelisted?.enabled) redirect('/not-whitelisted');

  return <Chat chats={chats} count={count} locale={locale} />;
}
