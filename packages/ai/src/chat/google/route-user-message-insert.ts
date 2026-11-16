import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { UIMessage } from 'ai';
import {
  originalUserText,
  persistRequestScopedUserMessage,
} from './route-message-preparation';

type InsertArgs = {
  message: string;
  chat_id: string;
  source: 'Mira' | 'Rewise';
};

/**
 * Builds the user-message insert used by `persistLatestUserMessage`:
 * request-scoped sends go through the idempotent admin path, direct-mode
 * clients insert as the user, and everything else uses the RPC.
 */
export function createUserMessageInserter({
  chatId,
  messageInsertMode,
  normalizedMessages,
  persistenceRequestId,
  sbAdmin,
  supabase,
  userId,
}: {
  chatId: string;
  messageInsertMode: 'direct' | 'rpc';
  normalizedMessages: readonly UIMessage[];
  persistenceRequestId?: string;
  sbAdmin: Awaited<ReturnType<typeof createAdminClient>>;
  supabase: TypedSupabaseClient;
  userId: string;
}) {
  return async (
    args: InsertArgs
  ): Promise<{ error: { message: string } | null }> => {
    if (messageInsertMode === 'direct' || persistenceRequestId) {
      if (!persistenceRequestId) {
        const { error } = await supabase.from('ai_chat_messages').insert({
          chat_id: chatId,
          content: args.message,
          creator_id: userId,
          metadata: { source: args.source },
          role: 'USER',
        });
        return { error };
      }
      return persistRequestScopedUserMessage({
        chatId,
        content: args.message,
        originalText: originalUserText(normalizedMessages),
        creatorId: userId,
        findExistingMessage: async () => {
          const { data, error } = await sbAdmin
            .from('ai_chat_messages')
            .select('content,creator_id,metadata')
            .eq('chat_id', chatId)
            .eq('role', 'USER')
            .contains('metadata', {
              requestId: persistenceRequestId,
              source: args.source,
            })
            .maybeSingle();
          return { data, error };
        },
        insertMessage: async (metadata) => {
          const { error } = await sbAdmin.from('ai_chat_messages').insert({
            chat_id: chatId,
            content: args.message,
            creator_id: userId,
            metadata,
            role: 'USER',
          });
          return { error };
        },
        requestId: persistenceRequestId,
        source: args.source,
      });
    }
    const { error } = await supabase.rpc(
      'insert_ai_chat_message' as never,
      args as never
    );
    return { error };
  };
}
