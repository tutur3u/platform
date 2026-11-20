'use client';

import type { ChatAttachmentDraft } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Badge } from '../badge';
import { toast } from '../sonner';
import { useSendChatMessage } from './hooks-messages';
import { type ChatMessageDraft, MessageComposer } from './message-composer';
import { MessageList, type MessageListProps } from './message-list';
import {
  isPostgresUuid,
  type PendingChatSendRequest,
  resolvePendingChatSendRequest,
} from './utils';

type ChatConversationThreadProps = Omit<
  MessageListProps,
  'isAgentTyping' | 'onReplyMessage' | 'typingLabel'
> & {
  conversationId: string;
  isAgentReadOnly: boolean;
  isAiConversation: boolean;
  isTyping: boolean;
  isUploading: boolean;
  onUploadFile: (file: File) => Promise<ChatAttachmentDraft>;
};

export function ChatConversationThread({
  conversationId,
  isAgentReadOnly,
  isAiConversation,
  isTyping,
  isUploading,
  onUploadFile,
  ...listProps
}: ChatConversationThreadProps) {
  const t = useTranslations('chat');
  const { currentUserId, messages, readOnly, wsId } = listProps;
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const pendingSendRequest = useRef<PendingChatSendRequest | null>(null);
  const sendMessage = useSendChatMessage({
    conversationId,
    currentUserId,
    streamAssistant: isAiConversation,
    wsId,
  });

  const replyTo = replyToMessageId
    ? {
        id: replyToMessageId,
        message: messages.find(
          (message) =>
            message.id === replyToMessageId &&
            message.conversationId === conversationId
        ),
      }
    : undefined;

  async function handleSend(payload: ChatMessageDraft) {
    pendingSendRequest.current = resolvePendingChatSendRequest(
      pendingSendRequest.current,
      payload,
      () => crypto.randomUUID()
    );
    const requestId = pendingSendRequest.current.requestId;
    try {
      const result = await sendMessage.mutateAsync({
        ...payload,
        clientRequestId: requestId,
      });
      if (pendingSendRequest.current?.requestId === requestId) {
        pendingSendRequest.current = null;
      }
      setReplyToMessageId((current) =>
        current === payload.replyToMessageId ? null : current
      );

      if (result.assistantError) {
        toast.error(t('assistant_response_failed'));
      }
    } catch (error) {
      toast.error(t('message_send_failed'));
      throw error;
    }
  }

  return (
    <>
      <MessageList
        {...listProps}
        isAgentTyping={(isAiConversation && sendMessage.isPending) || isTyping}
        onReplyMessage={
          !readOnly && isPostgresUuid(conversationId)
            ? setReplyToMessageId
            : undefined
        }
        onToggleReaction={
          isAiConversation ? undefined : listProps.onToggleReaction
        }
        typingLabel={isTyping ? t('external_visitor_typing') : undefined}
      />
      {readOnly ? (
        <div className="flex items-center justify-between gap-3 border-t bg-muted/25 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {t('read_only_conversation')}
          </span>
          {isAgentReadOnly ? (
            <Badge variant="secondary">{t('agent_channel')}</Badge>
          ) : null}
        </div>
      ) : (
        <MessageComposer
          isSending={sendMessage.isPending}
          isUploading={isUploading}
          onCancelReply={() => setReplyToMessageId(null)}
          onSend={handleSend}
          onUploadFile={onUploadFile}
          replyTo={replyTo}
        />
      )}
    </>
  );
}
