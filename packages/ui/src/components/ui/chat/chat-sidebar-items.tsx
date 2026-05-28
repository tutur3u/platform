'use client';

import { Bot, Hash, Users } from '@tuturuuu/icons';
import type { ChatConversation, ChatMessage } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Badge } from '../badge';
import {
  formatChatTime,
  getChatInitials,
  getConversationTitle,
  getLastMessagePreview,
  isReadOnlyChatConversation,
} from './utils';

export function ConversationRow({
  conversation,
  currentUserId,
  isSelected,
  onSelectConversation,
}: {
  conversation: ChatConversation;
  currentUserId: string;
  isSelected: boolean;
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

  return (
    <button
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent',
        isSelected && 'bg-accent'
      )}
      onClick={() => onSelectConversation(conversation.id)}
      type="button"
    >
      <ConversationAvatar
        conversation={conversation}
        currentUserId={currentUserId}
        title={title}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">{title}</span>
          {conversation.aiEnabled && (
            <Badge className="h-5" variant="secondary">
              <Bot className="size-3" />
              {t('ai_badge')}
            </Badge>
          )}
          {readOnly && (
            <Badge className="h-5" variant="outline">
              {t('read_only_badge')}
            </Badge>
          )}
        </span>
        <span className="mt-0.5 block truncate text-muted-foreground text-xs">
          {getLastMessagePreview(conversation.latestMessage, {
            attachment: t('attachment'),
            message: t('message'),
            messageDeleted: t('message_deleted'),
            noMessagesYet: t('no_messages_yet'),
          })}
        </span>
      </span>
      <ConversationUnreadState conversation={conversation} />
    </button>
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
    <div className="space-y-1 p-2">
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
}: {
  conversation: ChatConversation;
}) {
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span className="text-[11px] text-muted-foreground">
        {conversation.latestMessage
          ? formatChatTime(conversation.latestMessage.createdAt)
          : formatChatTime(conversation.updatedAt)}
      </span>
      {conversation.unreadCount > 0 && (
        <Badge className="h-5 min-w-5 px-1.5">{conversation.unreadCount}</Badge>
      )}
    </span>
  );
}
