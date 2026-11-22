'use client';

import type { FetchNextPageOptions } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LoaderCircle, MessageCircle } from '@tuturuuu/icons';
import type { ChatAttachment, ChatMessage } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  type UIEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { toast } from '../sonner';
import { MessageBubble } from './message-bubble';
import { MessageReplyQuote } from './message-reply-quote';
import { formatChatDate } from './utils';

const MAX_REPLY_HISTORY_PAGES = 5;

export interface MessageListProps {
  currentUserId: string;
  hasMoreMessages?: boolean;
  isAgentTyping?: boolean;
  isLoading?: boolean;
  isLoadingMoreMessages?: boolean;
  messages: ChatMessage[];
  onDeleteMessage?: (messageId: string) => void;
  onLoadMoreMessages?: (options: FetchNextPageOptions) => Promise<{
    data?: { pages: { messages: ChatMessage[] }[] };
    hasNextPage: boolean;
  }>;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  onReplyMessage?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  readOnly?: boolean;
  typingLabel?: string;
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
  onReplyMessage,
  onToggleReaction,
  readOnly,
  typingLabel,
  wsId,
}: MessageListProps) {
  const t = useTranslations('chat');
  const parentRef = useRef<HTMLDivElement | null>(null);
  const historyScrollHeightRef = useRef<number | null>(null);
  const pendingFocusRef = useRef<ChatMessage | null>(null);
  const historySearchRef = useRef<AbortController | null>(null);
  const [searchingOriginalId, setSearchingOriginalId] = useState<string | null>(
    null
  );
  const [historyJumpTarget, setHistoryJumpTarget] = useState<{
    conversationId: string;
    messageId: string;
  } | null>(null);
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
  const messageRowsById = useMemo(() => {
    const rows = new Map<string, { index: number; message: ChatMessage }>();
    items.forEach((item, index) => {
      if (item.type === 'message') {
        rows.set(item.message.id, { index, message: item.message });
      }
    });
    return rows;
  }, [items]);
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

  function focusJumpTarget() {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    if (pending.conversationId !== conversationId) {
      pendingFocusRef.current = null;
      return;
    }

    const row = messageRowsById.get(pending.id);
    if (!row) {
      pendingFocusRef.current = null;
      return;
    }
    const element = parentRef.current?.querySelector<HTMLDivElement>(
      `[data-chat-message][data-index="${row.index}"]`
    );
    if (!element) return;

    pendingFocusRef.current = null;
    element.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    focusJumpTarget();
  });

  useLayoutEffect(() => () => historySearchRef.current?.abort(), []);

  const loadOlderMessages = useCallback(() => {
    if (!(hasMoreMessages && onLoadMoreMessages)) return;
    if (isLoadingMoreMessages || historySearchRef.current) return;

    historyScrollHeightRef.current = parentRef.current?.scrollHeight ?? null;
    void onLoadMoreMessages({});
  }, [hasMoreMessages, isLoadingMoreMessages, onLoadMoreMessages]);

  function jumpToMessage(row: { index: number; message: ChatMessage }) {
    pendingFocusRef.current = row.message;
    shouldStickToBottomRef.current = false;
    virtualizer.scrollToIndex(row.index, { align: 'center' });
    focusJumpTarget();
  }

  async function findOriginalMessage(
    messageId: string,
    targetConversationId: string
  ) {
    if (!onLoadMoreMessages || !hasMoreMessages || historySearchRef.current)
      return;

    const search = new AbortController();
    historySearchRef.current = search;
    setSearchingOriginalId(messageId);
    shouldStickToBottomRef.current = false;

    try {
      for (let page = 0; page < MAX_REPLY_HISTORY_PAGES; page += 1) {
        historyScrollHeightRef.current ??=
          parentRef.current?.scrollHeight ?? null;
        const result = await onLoadMoreMessages({
          cancelRefetch: false,
          throwOnError: true,
        });
        if (search.signal.aborted) return;

        const found = result.data?.pages.some((page) =>
          page.messages.some(
            (message) =>
              message.id === messageId &&
              message.conversationId === targetConversationId
          )
        );
        if (found) {
          setHistoryJumpTarget({
            conversationId: targetConversationId,
            messageId,
          });
          return;
        }
        if (!result.hasNextPage) break;
      }
      toast.info(t('original_message_unavailable'));
    } catch {
      if (!search.signal.aborted)
        toast.error(t('original_message_load_failed'));
    } finally {
      if (!search.signal.aborted) {
        historySearchRef.current = null;
        setSearchingOriginalId(null);
      }
    }
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const distanceToBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight;
    if (!historySearchRef.current) {
      shouldStickToBottomRef.current = distanceToBottom < 180;
    }

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

    const frame = requestAnimationFrame(() => {
      if (shouldStickToBottomRef.current) {
        virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [conversationId, items.length, virtualizer]);

  useLayoutEffect(() => {
    if (!isLoadingMoreMessages && !searchingOriginalId) {
      historyScrollHeightRef.current = null;
    }
  }, [isLoadingMoreMessages, searchingOriginalId]);

  useLayoutEffect(() => {
    if (!historyJumpTarget) return;

    const row = messageRowsById.get(historyJumpTarget.messageId);
    if (row?.message.conversationId !== historyJumpTarget.conversationId)
      return;

    jumpToMessage(row);
    setHistoryJumpTarget(null);
  });

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
          const replyToMessageId =
            item.type === 'message' ? item.message.replyToMessageId : null;
          const replyTo = replyToMessageId
            ? messageRowsById.get(replyToMessageId)
            : undefined;
          const original =
            item.type === 'message' &&
            replyTo?.message.conversationId === item.message.conversationId
              ? replyTo
              : undefined;
          const isSearching = Boolean(
            replyToMessageId && searchingOriginalId === replyToMessageId
          );
          const canJump =
            original ||
            (onLoadMoreMessages && (hasMoreMessages || isSearching));

          return (
            <div
              className={cn(
                'absolute inset-x-0 top-0 px-4 py-2',
                item.type === 'message' &&
                  'focus:bg-accent/40 focus-visible:outline-2 focus:-outline-offset-2 focus-visible:outline-ring'
              )}
              data-chat-message={item.type === 'message' ? '' : undefined}
              data-index={virtualItem.index}
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
              tabIndex={item.type === 'message' ? -1 : undefined}
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
                <AgentTypingIndicator label={typingLabel} />
              ) : (
                <MessageRow
                  currentUserId={currentUserId}
                  message={item.message}
                  onDeleteMessage={readOnly ? undefined : onDeleteMessage}
                  onOpenAttachment={onOpenAttachment}
                  onReplyMessage={readOnly ? undefined : onReplyMessage}
                  onToggleReaction={readOnly ? undefined : onToggleReaction}
                  replyQuote={
                    replyToMessageId && !item.message.deletedAt ? (
                      <MessageReplyQuote
                        isSearching={isSearching}
                        message={original?.message}
                        onJump={
                          canJump
                            ? () => {
                                if (historySearchRef.current) return;
                                if (original) jumpToMessage(original);
                                else
                                  void findOriginalMessage(
                                    replyToMessageId,
                                    item.message.conversationId
                                  );
                              }
                            : undefined
                        }
                      />
                    ) : null
                  }
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
  onReplyMessage,
  onToggleReaction,
  replyQuote,
  showDate,
  wsId,
}: {
  currentUserId: string;
  message: ChatMessage;
  onDeleteMessage?: (messageId: string) => void;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  onReplyMessage?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  replyQuote: ReactNode;
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
          onReplyMessage={onReplyMessage}
          onToggleReaction={onToggleReaction}
          replyQuote={replyQuote}
          wsId={wsId}
        />
      )}
    </div>
  );
}

function AgentTypingIndicator({ label }: { label?: string }) {
  const t = useTranslations('chat');

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
      </div>
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
        <span className="sr-only">{label ?? t('agent_typing')}</span>
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
  const actorName = resolveUserDisplayName(message.sender, {
    fallback: t('unknown_sender'),
  });

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
