import { User } from '@/types/primitives/User';
import { Database } from '@/types/supabase';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export async function getCurrentSupabaseUser() {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentUser(noRedirect?: boolean) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (noRedirect) return null;
    redirect('/login');
  }

  const { data, error } = await supabase
    .from('users')
    .select(
      'id, display_name, avatar_url, handle, created_at, user_private_details(email, new_email, birthday)'
    )
    .eq('id', user.id)
    .single();

  if (error) notFound();
  const { user_private_details, ...rest } = data;
  return { ...rest, ...user_private_details } as User;
}
