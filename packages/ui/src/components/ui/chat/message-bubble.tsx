'use client';

import {
  Bot,
  CheckCheck,
  Copy,
  FileJson,
  FileText,
  SmilePlus,
  Trash2,
} from '@tuturuuu/icons';
import type { ChatAttachment, ChatMessage } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Button } from '../button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../context-menu';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { toast } from '../sonner';
import { AiMessageParts } from './ai-message-parts';
import { getAiMessagePartsFromMetadata } from './ai-message-render-utils';
import { MessageAttachmentButton } from './message-attachment-button';
import { MessageLinkPreviews, MessageText } from './message-links';
import { formatChatTime, getChatInitials } from './utils';

const REACTION_OPTIONS = [
  '\u{1F44D}',
  '\u{2764}\u{FE0F}',
  '\u{1F602}',
  '\u{1F389}',
  '\u{1F64F}',
  '\u{1F440}',
] as const;

export function MessageBubble({
  currentUserId,
  message,
  onDeleteMessage,
  onOpenAttachment,
  onToggleReaction,
  wsId,
}: {
  currentUserId: string;
  message: ChatMessage;
  onDeleteMessage?: (messageId: string) => void;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  wsId: string;
}) {
  const t = useTranslations('chat');
  const isOwnMessage = message.senderId === currentUserId;
  const senderName =
    message.sender?.displayName ??
    (message.kind === 'assistant' ? t('assistant_name') : t('unknown_sender'));

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
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
              wsId={wsId}
            />
            <ReactionBar
              message={message}
              onToggleReaction={onToggleReaction}
            />
          </div>
        </div>
      </ContextMenuTrigger>
      <MessageContextMenu
        message={message}
        onDeleteMessage={onDeleteMessage}
        senderName={senderName}
      />
    </ContextMenu>
  );
}

function MessageContextMenu({
  message,
  onDeleteMessage,
  senderName,
}: {
  message: ChatMessage;
  onDeleteMessage?: (messageId: string) => void;
  senderName: string;
}) {
  const t = useTranslations('chat');
  const canDelete = Boolean(onDeleteMessage && !message.deletedAt);

  async function copyMessage(format: 'json' | 'markdown' | 'text') {
    try {
      await navigator.clipboard.writeText(
        serializeMessage({ format, message, senderName })
      );
      toast.success(t('message_copied'));
    } catch {
      toast.error(t('message_copy_failed'));
    }
  }

  return (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onSelect={() => copyMessage('text')}>
        <Copy className="size-4" />
        {t('copy_as_text')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => copyMessage('markdown')}>
        <FileText className="size-4" />
        {t('copy_as_markdown')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => copyMessage('json')}>
        <FileJson className="size-4" />
        {t('copy_as_json')}
      </ContextMenuItem>
      {canDelete ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => onDeleteMessage?.(message.id)}
            variant="destructive"
          >
            <Trash2 className="size-4" />
            {t('delete_message')}
          </ContextMenuItem>
        </>
      ) : null}
    </ContextMenuContent>
  );
}

function serializeMessage({
  format,
  message,
  senderName,
}: {
  format: 'json' | 'markdown' | 'text';
  message: ChatMessage;
  senderName: string;
}) {
  const attachmentLines = message.attachments.map(
    (attachment) =>
      `${attachment.filename}${attachment.fullPath ? ` (${attachment.fullPath})` : ''}`
  );

  if (format === 'json') {
    return JSON.stringify(
      {
        attachments: message.attachments,
        content: message.content,
        createdAt: message.createdAt,
        id: message.id,
        kind: message.kind,
        metadata: message.metadata,
        sender: message.sender,
      },
      null,
      2
    );
  }

  if (format === 'markdown') {
    return [
      `**${senderName}** - ${new Date(message.createdAt).toISOString()}`,
      message.content,
      attachmentLines.length > 0
        ? attachmentLines.map((line) => `- ${line}`).join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  return [message.content, ...attachmentLines].filter(Boolean).join('\n');
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
  wsId,
}: {
  isOwnMessage: boolean;
  message: ChatMessage;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  wsId: string;
}) {
  const t = useTranslations('chat');
  const aiParts = getAiMessagePartsFromMetadata(message.metadata);

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
          {(message.content || aiParts?.length) && (
            <>
              {message.kind === 'assistant' ? (
                <AiMessageParts
                  isStreaming={message.metadata?.streaming === true}
                  parts={aiParts}
                  textFallback={message.content}
                />
              ) : (
                <MessageText content={message.content} />
              )}
              <MessageLinkPreviews
                content={message.content}
                conversationId={message.conversationId}
                isOwnMessage={isOwnMessage}
                wsId={wsId}
              />
            </>
          )}
          {message.attachments.length > 0 && (
            <div className="mt-2 grid gap-2">
              {message.attachments.map((attachment) => (
                <MessageAttachmentButton
                  attachment={attachment}
                  key={attachment.id}
                  onOpenAttachment={onOpenAttachment}
                  wsId={wsId}
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

  if (message.deletedAt || !onToggleReaction) return null;

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
      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-label={t('react_to_message')}
            className="size-7 rounded-full"
            size="icon"
            type="button"
            variant="ghost"
          >
            <SmilePlus className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-1">
          <div className="grid grid-cols-6 gap-1">
            {REACTION_OPTIONS.map((emoji) => (
              <Button
                aria-label={t('add_reaction', { reaction: emoji })}
                className="size-9 rounded-md text-lg"
                key={emoji}
                onClick={() => onToggleReaction(message.id, emoji)}
                size="icon"
                type="button"
                variant="ghost"
              >
                {emoji}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
