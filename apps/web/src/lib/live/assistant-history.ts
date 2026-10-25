import { resolveGatewayModelId } from '@tuturuuu/ai/credits/model-mapping';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
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

declare const ownedLiveChat: unique symbol;

/**
 * A chat row whose `creator_id` was matched to the caller (or that the caller
 * just created). Only `ensureAssistantLiveChat` produces it, so seed-history
 * reads can skip a second ownership round trip.
 */
export type OwnedAssistantLiveChat = ChatRow & {
  readonly [ownedLiveChat]: true;
};

/** Most recent stored messages considered for a fresh Live session. */
export const LIVE_SEED_MESSAGE_LIMIT = 60;
/**
 * Character budget for replayed history (~8k tokens). Gemini ingests seed
 * turns before the first reply, so unbounded history delays the first answer.
 */
export const LIVE_SEED_CHAR_BUDGET = 32_000;

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

/**
 * Builds chronological seed turns, keeping the newest messages that fit the
 * character budget. A single oversized latest message is truncated to its tail
 * rather than dropping all context.
 */
export function buildLiveSeedHistory(
  messages: ChatMessageRow[],
  charBudget = LIVE_SEED_CHAR_BUDGET
) {
  const history: LiveSeedContent[] = [];
  let remaining = charBudget;

  for (let index = messages.length - 1; index >= 0 && remaining > 0; index--) {
    const message = messages[index]!;
    const role = normalizeChatRole(message.role);
    const text = extractMessageSeedText(message);
    if (role == null || text == null) {
      continue;
    }

    if (text.length > remaining && history.length > 0) break;
    const kept = text.length > remaining ? text.slice(-remaining) : text;
    remaining -= kept.length;
    history.push({
      role,
      parts: [{ text: kept }],
    });
  }

  return history.reverse();
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
}): Promise<OwnedAssistantLiveChat> {
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
      return existingChat as OwnedAssistantLiveChat;
    }
  }

  const { data: createdChat, error: createError } = await supabase
    .from('ai_chats')
    .insert({
      ...(chatId == null ? {} : { id: chatId }),
      creator_id: userId,
      model: resolveGatewayModelId(model).toLowerCase(),
    })
    .select('id, title, model, is_public, created_at')
    .single();

  if (createError != null || createdChat == null) {
    throw new Error(createError?.message ?? 'Failed to create live chat');
  }

  return createdChat as OwnedAssistantLiveChat;
}

export async function loadAssistantLiveSeedHistory({
  chat,
  userId,
}: {
  chat: OwnedAssistantLiveChat;
  userId: string;
}) {
  // Message reads are server-only. The branded chat proves ownership was
  // checked by ensureAssistantLiveChat; the inner join re-asserts it in the
  // same round trip so a foreign chat id can never return messages.
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('ai_chat_messages')
    .select('role, content, metadata, ai_chats!chat_id!inner(creator_id)')
    .eq('chat_id', chat.id)
    .eq('ai_chats.creator_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(LIVE_SEED_MESSAGE_LIMIT);

  if (error != null) throw new Error(error.message);
  return buildLiveSeedHistory([...(data ?? [])].reverse());
}
