import type { createAdminClient } from '@tuturuuu/supabase/next/server';

export async function canAccessAiChatAttachments({
  supabase,
  wsId,
  chatId,
  actorId,
}: {
  supabase: Pick<Awaited<ReturnType<typeof createAdminClient>>, 'from'>;
  wsId: string;
  chatId: string;
  actorId?: string;
}): Promise<boolean> {
  if (!actorId) return false;
  try {
    const { data: chat, error: chatError } = await supabase
      .from('ai_chats')
      .select('id')
      .eq('id', chatId)
      .eq('creator_id', actorId)
      .maybeSingle();
    if (chatError || !chat) return false;

    // AI chats are global; workspace membership scopes access to the storage prefix.
    const { data: member, error: memberError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', actorId)
      .maybeSingle();
    return !memberError && !!member;
  } catch {
    return false;
  }
}
