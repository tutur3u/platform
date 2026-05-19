import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { AIChat } from '@tuturuuu/types';

export const getChats = async (user: Pick<SupabaseUser, 'email' | 'id'>) => {
  const supabase = await createAdminClient({ noCookie: true });

  const { data, error, count } = await supabase
    .from('ai_chats')
    .select('*', { count: 'exact' })
    .or(`creator_id.eq.${user.id},is_public.eq.true`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return { data: [], count: 0 };
  }

  return { data: (data ?? []) as AIChat[], count: count ?? data?.length ?? 0 };
};
