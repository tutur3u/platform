import type { SupabaseUser } from '@tuturuuu/supabase/next/user';

export async function getSupabaseSessionUser(): Promise<SupabaseUser | null> {
  try {
    const { createClient } = await import('@tuturuuu/supabase/next/server');
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user;
  } catch {
    return null;
  }
}
