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

export async function isUserPersonalChatWorkspace({
  supabase,
  userId,
  wsId,
}: {
  supabase: SessionAuthContext['supabase'];
  userId: string;
  wsId: string;
}) {
  return (await getUserPersonalWorkspaceId({ supabase, userId })) === wsId;
}

export async function filterNativeChatShadowRows<
  Chat extends { id: string; summary: string | null },
>(chatRows: Chat[]) {
  const visibleRows = chatRows.filter(
    (chat) => !chat.summary?.startsWith('native-chat-shadow:')
  );
  if (visibleRows.length === 0) return visibleRows;

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = (await sbAdmin
    .schema('private')
    .from('chat_conversations')
    .select('id')
    .in(
      'id',
      visibleRows.map((chat) => chat.id)
    )) as {
    data: { id: string }[] | null;
    error: { message?: string } | null;
  };

  if (error || !data?.length) return visibleRows;

  const nativeConversationIds = new Set(data.map((row) => row.id));
  return visibleRows.filter((chat) => !nativeConversationIds.has(chat.id));
}
