import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Chat from './chat';
import { Database } from '@/types/supabase';
import { getWorkspace } from '@/lib/workspace-helper';
import { AI_CHAT_DISABLED_PRESETS } from '@/constants/common';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function AIPage({ params: { wsId } }: Props) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: userData, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!userData || error) redirect('/login');

  const workspace = await getWorkspace(wsId);
  if (!workspace?.preset) notFound();

  if (AI_CHAT_DISABLED_PRESETS.includes(workspace.preset)) redirect(`/${wsId}`);
  return <Chat userData={{ ...userData, email: user.email }} />;
}
