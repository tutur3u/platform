import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { AIChat } from '@tuturuuu/types';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { isCurrentUserAIWhitelisted } from '@/lib/ai-whitelist';

export const resolveRewiseWorkspace = cache(async (workspaceId: string) => {
  const user = await getSatelliteAppSessionUser('rewise');
  if (!user?.id || !user.email) redirect('/login');

  if (!(await isCurrentUserAIWhitelisted())) {
    redirect('/not-whitelisted');
  }

  const workspace = await getWorkspace(workspaceId, {
    useAdmin: true,
    user,
  });

  return { user, workspace };
});

export async function requireRewiseWorkspace(workspaceId: string) {
  const result = await resolveRewiseWorkspace(workspaceId);
  if (!result.workspace) notFound();
  if (!result.workspace.joined) redirect('/');

  return {
    ...result,
    wsId: result.workspace.id,
  };
}

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
