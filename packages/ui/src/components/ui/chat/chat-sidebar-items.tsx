'use client';

import { Archive, Bot, Hash, Pin, PinOff, Users } from '@tuturuuu/icons';
import type { ChatConversation, ChatMessage } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Badge } from '../badge';
import { Button } from '../button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import {
  formatChatRelativeTime,
  getChatInitials,
  getConversationTitle,
  getLastMessagePreview,
  isChatConversationPinned,
  isReadOnlyChatConversation,
} from './utils';

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
  const readOnly = isReadOnlyChatConversation(conversation);
  const isAiConversation = conversation.type === 'ai';
  const pinned = isChatConversationPinned(conversation, currentUserId);

  return (
    <div
      className={cn(
        'group grid w-full min-w-0 items-center gap-3 overflow-hidden rounded-md px-2 py-2 text-left transition-colors hover:bg-accent',
        'grid-cols-[2.25rem_minmax(0,1fr)_3.5rem]',
        isSelected && 'bg-accent'
      )}
    >
      <button
        className="col-span-2 grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 text-left"
        onClick={() => onSelectConversation(conversation.id)}
        type="button"
      >
        <ConversationAvatar
          conversation={conversation}
          currentUserId={currentUserId}
          title={title}
        />
        <span className="min-w-0 overflow-hidden">
          <span className="flex min-w-0 items-center gap-2">
            <span className="line-clamp-1 min-w-0 flex-1 break-all font-medium text-sm">
              {title}
            </span>
            {conversation.aiEnabled && !isAiConversation && (
              <Badge className="h-5 shrink-0" variant="secondary">
                <Bot className="size-3" />
                {t('ai_badge')}
              </Badge>
            )}
            {readOnly && !isAiConversation && (
              <Badge className="h-5 shrink-0" variant="outline">
                {t('read_only_badge')}
              </Badge>
            )}
          </span>
          <span className="mt-0.5 line-clamp-1 break-all text-muted-foreground text-xs">
            {getLastMessagePreview(conversation.latestMessage, {
              attachment: t('attachment'),
              message: t('message'),
              messageDeleted: t('message_deleted'),
              noMessagesYet: t('no_messages_yet'),
              systemEvent: t('system_event'),
            })}
          </span>
        </span>
      </button>
      <ConversationUnreadState conversation={conversation} pinned={pinned} />
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

function ConversationAvatar({
  conversation,
  currentUserId,
  title,
}: {
  conversation: ChatConversation;
  currentUserId: string;
  title: string;
}) {
  const otherMember = conversation.members.find(
    (member) => member.userId !== currentUserId && member.role !== 'assistant'
  );

  if (conversation.type === 'direct' && otherMember) {
    return (
      <Avatar className="size-9">
        <AvatarImage
          alt={otherMember.user.displayName}
          src={otherMember.user.avatarUrl ?? undefined}
        />
        <AvatarFallback>
          {getChatInitials(otherMember.user.displayName)}
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar className="size-9">
      <AvatarFallback>
        {conversation.type === 'ai' ? (
          <Bot className="size-4" />
        ) : conversation.type === 'channel' ? (
          <Hash className="size-4" />
        ) : conversation.type === 'group' ? (
          <Users className="size-4" />
        ) : (
          getChatInitials(title)
        )}
      </AvatarFallback>
    </Avatar>
  );
}

function ConversationUnreadState({
  conversation,
  pinned,
}: {
  conversation: ChatConversation;
  pinned: boolean;
}) {
  return (
    <span className="flex w-12 shrink-0 flex-col items-end gap-1 overflow-hidden transition-opacity group-focus-within:opacity-0 group-hover:opacity-0">
      <span className="max-w-full truncate text-[11px] text-muted-foreground">
        {formatChatRelativeTime(
          conversation.latestMessage?.createdAt ?? conversation.updatedAt
        )}
      </span>
      {conversation.unreadCount > 0 ? (
        <Badge className="h-5 min-w-5 px-1.5">{conversation.unreadCount}</Badge>
      ) : pinned ? (
        <Pin className="size-3.5 text-muted-foreground" />
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
    <span className="pointer-events-none col-start-3 row-start-1 flex justify-end opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
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
