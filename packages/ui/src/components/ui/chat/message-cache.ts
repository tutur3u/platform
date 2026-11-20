import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { ChatMessage } from '@tuturuuu/internal-api';
import { chatQueryKeys } from './query-keys';

export interface ChatMessagesPage {
  hasMore: boolean;
  limit: number;
  messages: ChatMessage[];
  nextBefore: string | null;
}

export function flattenChatMessagePages(data?: InfiniteData<ChatMessagesPage>) {
  return [...(data?.pages ?? [])].reverse().flatMap((page) => page.messages);
}

export function patchCachedMessages(
  queryClient: QueryClient,
  wsId: string,
  conversationId: string,
  updater: (messages: ChatMessage[]) => ChatMessage[]
) {
  queryClient.setQueriesData<ChatMessage[]>(
    {
      queryKey: [...chatQueryKeys.all(wsId), 'messages', conversationId],
    },
    (current = []) => updater(current)
  );
  queryClient.setQueriesData<InfiniteData<ChatMessagesPage>>(
    {
      queryKey: [
        ...chatQueryKeys.all(wsId),
        'messages-infinite',
        conversationId,
      ],
    },
    (current) => {
      if (!current?.pages.length) return current;

      const previousPages = new Map<string, number>();
      const pages = current.pages.map((page, index) => {
        for (const message of page.messages)
          previousPages.set(message.id, index);
        return { ...page, messages: [] as ChatMessage[] };
      });

      // Keep the API's cursors and partition the updated chronological list
      // along the existing page boundaries, from newest to oldest.
      let pageIndex = 0;
      const messages = updater(flattenChatMessagePages(current));
      for (const message of [...messages].reverse()) {
        pageIndex = Math.max(pageIndex, previousPages.get(message.id) ?? 0);
        pages[pageIndex]?.messages.push(message);
      }

      for (const page of pages) page.messages.reverse();
      return { ...current, pages };
    }
  );
}
