import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SessionAuthContext } from '@/lib/api-auth';

export async function getUserPersonalWorkspaceId({
  supabase,
  userId,
}: {
  supabase: SessionAuthContext['supabase'];
  userId: string;
}) {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id')
    .eq('creator_id', userId)
    .eq('personal', true)
    .eq('deleted', false)
    .maybeSingle();

  if (error) return null;
  return typeof data?.id === 'string' ? data.id : null;
}

export async function filterNativeChatShadowRows<
  Chat extends { id: string; summary: string | null },
>(chatRows: Chat[]) {
  if (chatRows.length === 0) return chatRows;

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = (await sbAdmin
    .schema('private')
    .from('chat_conversations')
    .select('id')
    .in(
      'id',
      chatRows.map((chat) => chat.id)
    )) as {
    data: { id: string }[] | null;
    error: { message?: string } | null;
  };

  if (error || !data?.length) return chatRows;

  const nativeConversationIds = new Set(data.map((row) => row.id));
  return chatRows.filter((chat) => !nativeConversationIds.has(chat.id));
}
