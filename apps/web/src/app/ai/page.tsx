import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Chat from './chat';
import { Database } from '@/types/database.types';

export const dynamic = 'force-dynamic';

export default async function AIPage() {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!userData) redirect('/login');
  return <Chat userData={{ ...userData, email: user.email }} />;
}
