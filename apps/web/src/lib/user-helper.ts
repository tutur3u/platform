import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createClient } from '@/utils/supabase/server';
import { unstable_noStore } from 'next/cache';
import { notFound, redirect } from 'next/navigation';

export async function getCurrentSupabaseUser() {
  unstable_noStore();
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentUser(noRedirect?: boolean) {
  unstable_noStore();
  const supabase = createClient();

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
  return { ...rest, ...user_private_details } as WorkspaceUser;
}
