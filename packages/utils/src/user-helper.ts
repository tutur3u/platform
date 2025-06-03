import { createClient } from '@ncthub/supabase/next/server';
import { WorkspaceUser } from '@ncthub/types/primitives/WorkspaceUser';
import { notFound, redirect } from 'next/navigation';

export async function getCurrentSupabaseUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentUser(noRedirect?: boolean) {
  const supabase = await createClient();

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
      'id, display_name, avatar_url, bio, handle, created_at, user_private_details(email, new_email, birthday, full_name)'
    )
    .eq('id', user.id)
    .single();

  if (error) notFound();
  const { user_private_details, ...rest } = data;
  return { ...rest, ...user_private_details } as WorkspaceUser;
}
