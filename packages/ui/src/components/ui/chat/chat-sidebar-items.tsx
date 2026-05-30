'use client';

import { Archive, Pin, PinOff } from '@tuturuuu/icons';
import type { ChatConversation, ChatMessage } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Button } from '../button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { getConversationTitle, isChatConversationPinned } from './utils';

export function ConversationRow({
  conversation,
  currentUserId,
  isSelected,
  onArchiveConversation,
  onPinConversation,
  onSelectConversation,
}: {
  conversation: ChatConversation;
  currentUserId: string;
  isSelected: boolean;
  onArchiveConversation?: (conversationId: string) => void;
  onPinConversation?: (conversationId: string, pinned: boolean) => void;
  onSelectConversation: (conversationId: string) => void;
}) {
  const t = useTranslations('chat');
  const title = getConversationTitle(conversation, currentUserId, {
    ai: t('assistant_name'),
    channel: t('untitled_channel'),
    chat: t('untitled_chat'),
    direct: t('direct_message'),
    group: t('group_chat'),
  });
  const pinned = isChatConversationPinned(conversation, currentUserId);

  return (
    <div
      className={cn(
        'group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-center gap-1 overflow-hidden rounded-md px-2 py-1 text-left transition-colors hover:bg-accent',
        isSelected && 'bg-accent'
      )}
    >
      <button
        className="min-w-0 py-1 text-left"
        onClick={() => onSelectConversation(conversation.id)}
        type="button"
      >
        <span className="block min-w-0 truncate font-medium text-sm leading-5">
          {title}
        </span>
      </button>
      <ConversationUnreadState unreadCount={conversation.unreadCount} />
      <ConversationQuickActions
        archived={Boolean(conversation.archivedAt)}
        conversationId={conversation.id}
        onArchiveConversation={onArchiveConversation}
        onPinConversation={onPinConversation}
        pinned={pinned}
      />
    </div>
  );
}

export function SearchResultList({
  messages,
  onSelectConversation,
}: {
  messages: ChatMessage[];
  onSelectConversation: (conversationId: string) => void;
}) {
  const t = useTranslations('chat');

  if (messages.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        {t('no_search_results')}
      </div>
    );
  }

  return (
    <div className="h-full space-y-1 overflow-y-auto p-2">
      {messages.map((message) => (
        <button
          className="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
          key={message.id}
          onClick={() => onSelectConversation(message.conversationId)}
          type="button"
        >
          <span className="block truncate font-medium text-sm">
            {message.sender?.displayName ?? t('unknown_sender')}
          </span>
          <span className="mt-1 line-clamp-2 text-muted-foreground text-xs">
            {message.content}
          </span>
        </button>
      ))}
    </div>
  );
}

function ConversationUnreadState({ unreadCount }: { unreadCount: number }) {
  const t = useTranslations('chat');

  return (
    <span className="col-start-2 row-start-1 flex justify-end pr-1 transition-opacity group-focus-within:opacity-0 group-hover:opacity-0">
      {unreadCount > 0 ? (
        <>
          <span className="sr-only">
            {t('unread_messages_count', { count: unreadCount })}
          </span>
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-foreground"
          />
        </>
      ) : null}
    </span>
  );
}

function ConversationQuickActions({
  archived,
  conversationId,
  onArchiveConversation,
  onPinConversation,
  pinned,
}: {
  archived: boolean;
  conversationId: string;
  onArchiveConversation?: (conversationId: string) => void;
  onPinConversation?: (conversationId: string, pinned: boolean) => void;
  pinned: boolean;
}) {
  const t = useTranslations('chat');

  return (
    <span className="pointer-events-none col-start-2 row-start-1 flex justify-end opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
      <span className="flex items-center gap-1">
        {onPinConversation ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={
                  pinned ? t('unpin_conversation') : t('pin_conversation')
                }
                className="size-7"
                onClick={(event) => {
                  event.stopPropagation();
                  onPinConversation(conversationId, !pinned);
                }}
                onMouseDown={(event) => event.preventDefault()}
                size="icon"
                title={pinned ? t('unpin_conversation') : t('pin_conversation')}
                type="button"
                variant="ghost"
              >
                {pinned ? (
                  <PinOff className="size-3.5" />
                ) : (
                  <Pin className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {pinned ? t('unpin_conversation') : t('pin_conversation')}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {onArchiveConversation && !archived ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('archive_chat')}
                className="size-7"
                onClick={(event) => {
                  event.stopPropagation();
                  onArchiveConversation(conversationId);
                }}
                onMouseDown={(event) => event.preventDefault()}
                size="icon"
                title={t('archive_chat')}
                type="button"
                variant="ghost"
              >
                <Archive className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('archive_chat')}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
    </span>
  );
}
