import Chat from './chat';
import { getChats } from './helper';
import { getCurrentUser } from '@/lib/user-helper';
import { createAdminClient } from '@tutur3u/supabase/next/server';
import { redirect } from 'next/navigation';

interface Props {
  searchParams: Promise<{
    lang: string;
  }>;
}

export default async function AIPage({ searchParams }: Props) {
  const { lang: locale } = await searchParams;
  const { data: chats, count } = await getChats();

  const user = await getCurrentUser();
  if (!user?.email) redirect('/login');

  const adminSb = await createAdminClient();

  const { data: whitelisted, error } = await adminSb
    .from('ai_whitelisted_emails')
    .select('enabled')
    .eq('email', user?.email)
    .maybeSingle();

  if (error || !whitelisted?.enabled) redirect('/not-whitelisted');

  return <Chat chats={chats} count={count} locale={locale} />;
}
