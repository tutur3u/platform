'use client';

import { LoaderCircle, MessageCircle } from '@tuturuuu/icons';
import type { ChatAttachment, ChatMessage } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Badge } from '../badge';
import { ScrollArea } from '../scroll-area';
import { MessageBubble } from './message-bubble';
import { formatChatDate } from './utils';

interface MessageListProps {
  currentUserId: string;
  isAgentTyping?: boolean;
  isLoading?: boolean;
  messages: ChatMessage[];
  onDeleteMessage?: (messageId: string) => void;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  readOnly?: boolean;
  wsId: string;
}

export function MessageList({
  currentUserId,
  isAgentTyping,
  isLoading,
  messages,
  onDeleteMessage,
  onOpenAttachment,
  onToggleReaction,
  readOnly,
  wsId,
}: MessageListProps) {
  const t = useTranslations('chat');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
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
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-5 p-4">
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const showDate =
            !previous ||
            formatChatDate(previous.createdAt) !==
              formatChatDate(message.createdAt);

          return (
            <div key={message.id}>
              {showDate && (
                <div className="mb-4 flex justify-center">
                  <Badge variant="outline">
                    {formatChatDate(message.createdAt)}
                  </Badge>
                </div>
              )}
              {message.kind === 'system' ? (
                <MessageSystemEvent message={message} />
              ) : (
                <MessageBubble
                  currentUserId={currentUserId}
                  message={message}
                  onDeleteMessage={readOnly ? undefined : onDeleteMessage}
                  onOpenAttachment={onOpenAttachment}
                  onToggleReaction={readOnly ? undefined : onToggleReaction}
                  wsId={wsId}
                />
              )}
            </div>
          );
        })}
        {isAgentTyping ? <AgentTypingIndicator /> : null}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
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
