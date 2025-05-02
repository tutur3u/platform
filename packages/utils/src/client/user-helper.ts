import { createClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { type User, type UserPrivateDetails } from '@tuturuuu/types/db';

export async function getCurrentSupabaseUser(): Promise<SupabaseUser | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentUser(): Promise<
  (User & UserPrivateDetails) | null
> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.id) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*, ...user_private_details(*)')
    .eq('id', user.id)
    .single();

  if (error) return null;
  return data as User & UserPrivateDetails;
}
