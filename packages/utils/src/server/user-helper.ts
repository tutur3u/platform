import { createClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { type User, type UserPrivateDetails } from '@tuturuuu/types/db';
import { notFound, redirect } from 'next/navigation';

export async function getCurrentSupabaseUser(): Promise<SupabaseUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentUser(
  noRedirect?: boolean
): Promise<(User & UserPrivateDetails) | null> {
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
    .select('*, ...user_private_details(*)')
    .eq('id', user.id)
    .single();

  if (error) notFound();
  return data as User & UserPrivateDetails;
}
