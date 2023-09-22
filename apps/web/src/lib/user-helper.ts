import { User } from '@/types/primitives/User';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export async function getCurrentUser() {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('users')
    .select('id, display_name, avatar_url, handle, created_at')
    .eq('id', user.id)
    .single();

  if (error) notFound();
  return { ...data, email: user.email } as User;
}
