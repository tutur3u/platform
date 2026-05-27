'use client';

import { Bot, CheckCheck, SmilePlus } from '@tuturuuu/icons';
import type { ChatAttachment, ChatMessage } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Button } from '../button';
import { MessageAttachmentButton } from './message-attachment-button';
import { formatChatTime, getChatInitials } from './utils';

export function MessageBubble({
  currentUserId,
  message,
  onOpenAttachment,
  onToggleReaction,
}: {
  currentUserId: string;
  message: ChatMessage;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
}) {
  const t = useTranslations('chat');
  const isOwnMessage = message.senderId === currentUserId;
  const senderName =
    message.sender?.displayName ??
    (message.kind === 'assistant' ? t('assistant_name') : t('unknown_sender'));

  return (
    <div
      className={cn(
        'flex gap-3',
        isOwnMessage ? 'justify-end' : 'justify-start'
      )}
    >
      {!isOwnMessage && (
        <Avatar className="mt-1 size-8">
          {message.kind === 'assistant' ? (
            <AvatarFallback>
              <Bot className="size-4" />
            </AvatarFallback>
          ) : (
            <>
              <AvatarImage
                alt={senderName}
                src={message.sender?.avatarUrl ?? undefined}
              />
              <AvatarFallback>{getChatInitials(senderName)}</AvatarFallback>
            </>
          )}
        </Avatar>
      )}

      <div
        className={cn(
          'group flex max-w-[min(42rem,82%)] flex-col gap-1',
          isOwnMessage && 'items-end'
        )}
      >
        <MessageMetadata
          isOwnMessage={isOwnMessage}
          message={message}
          senderName={senderName}
        />
        <MessageContent
          isOwnMessage={isOwnMessage}
          message={message}
          onOpenAttachment={onOpenAttachment}
        />
        <ReactionBar message={message} onToggleReaction={onToggleReaction} />
      </div>
    </div>
  );
}

function MessageMetadata({
  isOwnMessage,
  message,
  senderName,
}: {
  isOwnMessage: boolean;
  message: ChatMessage;
  senderName: string;
}) {
  const t = useTranslations('chat');

  return (
    <div className="flex items-center gap-2 text-muted-foreground text-xs">
      {!isOwnMessage && <span className="font-medium">{senderName}</span>}
      <span>{formatChatTime(message.createdAt)}</span>
      {message.editedAt && <span>{t('edited')}</span>}
      {isOwnMessage && <CheckCheck className="size-3.5" />}
    </div>
  );
}

function MessageContent({
  isOwnMessage,
  message,
  onOpenAttachment,
}: {
  isOwnMessage: boolean;
  message: ChatMessage;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
}) {
  const t = useTranslations('chat');

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm leading-6 shadow-xs',
        isOwnMessage
          ? 'border-dynamic-blue/20 bg-dynamic-blue/10'
          : 'bg-muted/40'
      )}
    >
      {message.deletedAt ? (
        <span className="text-muted-foreground italic">
          {t('message_deleted')}
        </span>
      ) : (
        <>
          {message.content && (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
          {message.attachments.length > 0 && (
            <div className="mt-2 grid gap-2">
              {message.attachments.map((attachment) => (
                <MessageAttachmentButton
                  attachment={attachment}
                  key={attachment.id}
                  onOpenAttachment={onOpenAttachment}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReactionBar({
  message,
  onToggleReaction,
}: {
  message: ChatMessage;
  onToggleReaction?: (messageId: string, emoji: string) => void;
}) {
  const t = useTranslations('chat');

  if (message.deletedAt) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 opacity-100 md:opacity-80 md:transition-opacity md:group-hover:opacity-100">
      {message.reactions.map((reaction) => (
        <Button
          className="h-7 gap-1 rounded-full px-2 text-xs"
          key={reaction.emoji}
          onClick={() => onToggleReaction?.(message.id, reaction.emoji)}
          type="button"
          variant="outline"
        >
          <span>{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </Button>
      ))}
      <Button
        aria-label={t('react_to_message')}
        className="size-7 rounded-full"
        onClick={() => onToggleReaction?.(message.id, '+1')}
        size="icon"
        type="button"
        variant="ghost"
      >
        <SmilePlus className="size-3.5" />
      </Button>
    </div>
  );
}
