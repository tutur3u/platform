import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { AIChat } from '@tuturuuu/types';

export const getChats = async (user: Pick<SupabaseUser, 'email' | 'id'>) => {
  const supabase = await createAdminClient({ noCookie: true });

  const { data: visibleChats, error: visibleChatsError } = await supabase
    .from('ai_chats')
    .select('*', { count: 'exact' })
    .or(`creator_id.eq.${user.id},is_public.eq.true`)
    .order('created_at', { ascending: false });

  if (visibleChatsError) {
    console.error(visibleChatsError);
    return { data: [], count: 0 };
  }

  let memberChats: AIChat[] = [];

  if (user.email) {
    const { data: memberships, error: membershipsError } = await supabase
      .from('ai_chat_members')
      .select('chat_id')
      .eq('email', user.email);

    if (membershipsError) {
      console.error(membershipsError);
      return { data: [], count: 0 };
    }

    const memberChatIds = memberships
      ?.map((membership) => membership.chat_id)
      .filter(Boolean);

    if (memberChatIds?.length) {
      const { data: chats, error: chatsError } = await supabase
        .from('ai_chats')
        .select('*')
        .in('id', memberChatIds);

      if (chatsError) {
        console.error(chatsError);
        return { data: [], count: 0 };
      }

      memberChats = (chats ?? []) as AIChat[];
    }
  }

  const dedupedChats = new Map<string, AIChat>();
  for (const chat of [...((visibleChats ?? []) as AIChat[]), ...memberChats]) {
    dedupedChats.set(chat.id, chat);
  }

  const data = [...dedupedChats.values()].sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  );

  return { data, count: data.length };
};
