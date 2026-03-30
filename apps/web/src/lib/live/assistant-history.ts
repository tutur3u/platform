import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types';

type LiveSeedPart = {
  text: string;
};

export type LiveSeedContent = {
  role: 'user' | 'model';
  parts: LiveSeedPart[];
};

type ChatMessageRow = {
  role: string | null;
  content: string | null;
  metadata: Json;
};

type ChatRow = {
  id: string;
  title: string | null;
  model: string | null;
  is_public: boolean | null;
  created_at: string | null;
};

function normalizeChatRole(role: string | null): 'user' | 'model' | null {
  if (role == null) return null;
  const normalized = role.toLowerCase();
  if (normalized === 'user') return 'user';
  if (normalized === 'assistant') return 'model';
  return null;
}

function extractMessageSeedText(message: ChatMessageRow): string | null {
  const content = message.content?.trim();
  if (content != null && content.length > 0) {
    return content;
  }

  if (message.metadata == null || Array.isArray(message.metadata)) {
    return null;
  }

  const metadata = message.metadata as Record<string, unknown>;
  const reasoning = metadata.reasoning;
  if (typeof reasoning === 'string' && reasoning.trim().length > 0) {
    return reasoning.trim();
  }

  return null;
}

export function buildLiveSeedHistory(messages: ChatMessageRow[]) {
  const history: LiveSeedContent[] = [];

  for (const message of messages) {
    const role = normalizeChatRole(message.role);
    const text = extractMessageSeedText(message);
    if (role == null || text == null) {
      continue;
    }

    history.push({
      role,
      parts: [{ text }],
    });
  }

  return history;
}

export async function ensureAssistantLiveChat({
  supabase,
  userId,
  chatId,
  model,
}: {
  supabase: TypedSupabaseClient;
  userId: string;
  chatId?: string;
  model: string;
}): Promise<ChatRow> {
  if (chatId != null) {
    const { data: existingChat, error } = await supabase
      .from('ai_chats')
      .select('id, title, model, is_public, created_at')
      .eq('id', chatId)
      .eq('creator_id', userId)
      .maybeSingle();

    if (error != null) {
      throw new Error(error.message);
    }

    if (existingChat != null) {
      return existingChat;
    }
  }

  const { data: createdChat, error: createError } = await supabase
    .from('ai_chats')
    .insert({
      id: chatId,
      creator_id: userId,
      model: model.includes('/')
        ? model.split('/').pop()!.toLowerCase()
        : model,
    })
    .select('id, title, model, is_public, created_at')
    .single();

  if (createError != null || createdChat == null) {
    throw new Error(createError?.message ?? 'Failed to create live chat');
  }

  return createdChat;
}

export async function loadAssistantLiveSeedHistory({
  supabase,
  chatId,
  userId,
}: {
  supabase: TypedSupabaseClient;
  chatId: string;
  userId: string;
}) {
  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('role, content, metadata, ai_chats!chat_id!inner(creator_id)')
    .eq('chat_id', chatId)
    .eq('ai_chats.creator_id', userId)
    .order('created_at', { ascending: true });

  if (error != null) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).map(({ ai_chats: _chat, ...message }) => message);
  return buildLiveSeedHistory(rows);
}
