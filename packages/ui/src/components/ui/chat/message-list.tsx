'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { LoaderCircle, MessageCircle } from '@tuturuuu/icons';
import type { ChatAttachment, ChatMessage } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import {
  type UIEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { MessageBubble } from './message-bubble';
import { formatChatDate } from './utils';

interface MessageListProps {
  currentUserId: string;
  hasMoreMessages?: boolean;
  isAgentTyping?: boolean;
  isLoading?: boolean;
  isLoadingMoreMessages?: boolean;
  messages: ChatMessage[];
  onDeleteMessage?: (messageId: string) => void;
  onLoadMoreMessages?: () => Promise<unknown> | undefined;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  readOnly?: boolean;
  wsId: string;
}

type MessageListItem =
  | { key: string; type: 'history' }
  | { key: string; message: ChatMessage; showDate: boolean; type: 'message' }
  | { key: string; type: 'typing' };

export function MessageList({
  currentUserId,
  hasMoreMessages,
  isAgentTyping,
  isLoading,
  isLoadingMoreMessages,
  messages,
  onDeleteMessage,
  onLoadMoreMessages,
  onOpenAttachment,
  onToggleReaction,
  readOnly,
  wsId,
}: MessageListProps) {
  const t = useTranslations('chat');
  const parentRef = useRef<HTMLDivElement | null>(null);
  const historyScrollHeightRef = useRef<number | null>(null);
  const previousConversationIdRef = useRef<string | null>(null);
  const previousOldestMessageIdRef = useRef<string | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const conversationId = messages[0]?.conversationId ?? null;
  const oldestMessageId = messages[0]?.id ?? null;
  const items = useMemo<MessageListItem[]>(() => {
    const next: MessageListItem[] = [];
    if (hasMoreMessages) next.push({ key: 'history', type: 'history' });

    messages.forEach((message, index) => {
      const previous = messages[index - 1];
      next.push({
        key: message.id,
        message,
        showDate:
          !previous ||
          formatChatDate(previous.createdAt) !==
            formatChatDate(message.createdAt),
        type: 'message',
      });
    });

    if (isAgentTyping) next.push({ key: 'typing', type: 'typing' });
    return next;
  }, [hasMoreMessages, isAgentTyping, messages]);
  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: (index) => {
      const item = items[index];
      if (item?.type === 'history') return 48;
      if (item?.type === 'typing') return 56;
      return item?.showDate ? 124 : 92;
    },
    getItemKey: (index) => items[index]?.key ?? index,
    getScrollElement: () => parentRef.current,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();

  const loadOlderMessages = useCallback(() => {
    if (!(hasMoreMessages && onLoadMoreMessages)) return;
    if (isLoadingMoreMessages) return;

    historyScrollHeightRef.current = parentRef.current?.scrollHeight ?? null;
    void onLoadMoreMessages();
  }, [hasMoreMessages, isLoadingMoreMessages, onLoadMoreMessages]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const distanceToBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 180;

    if (target.scrollTop < 160) {
      loadOlderMessages();
    }
  }

  useLayoutEffect(() => {
    const parent = parentRef.current;
    if (!parent || !oldestMessageId) return;

    const previousOldestMessageId = previousOldestMessageIdRef.current;
    if (
      historyScrollHeightRef.current !== null &&
      previousOldestMessageId &&
      previousOldestMessageId !== oldestMessageId
    ) {
      const delta = parent.scrollHeight - historyScrollHeightRef.current;
      parent.scrollTop += delta;
      historyScrollHeightRef.current = null;
    }

    previousOldestMessageIdRef.current = oldestMessageId;
  }, [oldestMessageId]);

  useLayoutEffect(() => {
    if (items.length === 0) return;

    const conversationChanged =
      conversationId !== previousConversationIdRef.current;
    if (conversationChanged) {
      previousConversationIdRef.current = conversationId;
      shouldStickToBottomRef.current = true;
    }

    if (historyScrollHeightRef.current !== null) return;
    if (!(conversationChanged || shouldStickToBottomRef.current)) return;

    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
    });
  }, [conversationId, items.length, virtualizer]);

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground text-sm">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {t('loading_messages')}
      </div>
    );
  }

  if (messages.length === 0 && !isAgentTyping) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
        <div className="max-w-sm">
          <MessageCircle className="mx-auto mb-3 size-8 text-muted-foreground" />
          <div className="font-medium">{t('empty_messages_title')}</div>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('empty_messages_description')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      onScroll={handleScroll}
      ref={parentRef}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) return null;

          return (
            <div
              className="absolute inset-x-0 top-0 px-4 py-2"
              data-index={virtualItem.index}
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              {item.type === 'history' ? (
                <div className="flex justify-center">
                  <Button
                    disabled={isLoadingMoreMessages}
                    onClick={loadOlderMessages}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {isLoadingMoreMessages ? (
                      <LoaderCircle className="mr-2 size-3.5 animate-spin" />
                    ) : null}
                    {isLoadingMoreMessages
                      ? t('loading_older_messages')
                      : t('load_older_messages')}
                  </Button>
                </div>
              ) : item.type === 'typing' ? (
                <AgentTypingIndicator />
              ) : (
                <MessageRow
                  currentUserId={currentUserId}
                  message={item.message}
                  onDeleteMessage={readOnly ? undefined : onDeleteMessage}
                  onOpenAttachment={onOpenAttachment}
                  onToggleReaction={readOnly ? undefined : onToggleReaction}
                  showDate={item.showDate}
                  wsId={wsId}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MessageRow({
  currentUserId,
  message,
  onDeleteMessage,
  onOpenAttachment,
  onToggleReaction,
  showDate,
  wsId,
}: {
  currentUserId: string;
  message: ChatMessage;
  onDeleteMessage?: (messageId: string) => void;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  showDate: boolean;
  wsId: string;
}) {
  return (
    <div>
      {showDate ? (
        <div className="mb-4 flex justify-center">
          <Badge variant="outline">{formatChatDate(message.createdAt)}</Badge>
        </div>
      ) : null}
      {message.kind === 'system' ? (
        <MessageSystemEvent message={message} />
      ) : (
        <MessageBubble
          currentUserId={currentUserId}
          message={message}
          onDeleteMessage={onDeleteMessage}
          onOpenAttachment={onOpenAttachment}
          onToggleReaction={onToggleReaction}
          wsId={wsId}
        />
      )}
    </div>
  );
}

function AgentTypingIndicator() {
  const t = useTranslations('chat');

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
      </div>
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
        <span className="sr-only">{t('agent_typing')}</span>
        <span aria-hidden="true" className="flex items-center gap-1">
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
          <span className="size-1.5 animate-pulse rounded-full bg-current delay-150" />
          <span className="size-1.5 animate-pulse rounded-full bg-current delay-300" />
        </span>
      </div>
    </div>
  );
}

function MessageSystemEvent({ message }: { message: ChatMessage }) {
  const t = useTranslations('chat');
  const metadata = message.metadata;
  const eventType =
    typeof metadata.eventType === 'string' ? metadata.eventType : null;
  const actorName = message.sender?.displayName ?? t('unknown_sender');

  let label = message.content || t('system_event_generic');

  if (eventType === 'conversation.renamed') {
    const title = typeof metadata.title === 'string' ? metadata.title : '';
    label = title
      ? t('system_event_conversation_renamed', { actorName, title })
      : t('system_event_conversation_updated', { actorName });
  } else if (eventType === 'conversation.description_updated') {
    label = t('system_event_conversation_updated', { actorName });
  }

  return (
    <div className="flex justify-center px-4">
      <span className="rounded-full border bg-muted/40 px-3 py-1 text-muted-foreground text-xs">
        {label}
      </span>
    </div>
  );
}
