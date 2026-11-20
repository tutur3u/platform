import 'server-only';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';

export const getChats = async () => {
  const { user } = await resolveAuthenticatedSessionUser(await createClient());
  if (!user) return { data: [], count: 0 };
  return listOwnedChats(user.id);
};

export const listOwnedChats = async (userId: string) => {
  const admin = await createAdminClient({ noCookie: true });

  const { data, count, error } = await admin
    .from('ai_chats')
    .select('*', { count: 'exact' })
    .eq('creator_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return { data: [], count: 0 };
  }

  return { data, count };
};
