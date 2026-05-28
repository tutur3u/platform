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
  isLoading?: boolean;
  messages: ChatMessage[];
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  readOnly?: boolean;
}

export function MessageList({
  currentUserId,
  isLoading,
  messages,
  onOpenAttachment,
  onToggleReaction,
  readOnly,
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

  if (messages.length === 0) {
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
              <MessageBubble
                currentUserId={currentUserId}
                message={message}
                onOpenAttachment={onOpenAttachment}
                onToggleReaction={readOnly ? undefined : onToggleReaction}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
