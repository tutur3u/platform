'use client';

import type {
  ChatAttachment,
  ChatAttachmentDraft,
} from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../badge';
import { toast } from '../sonner';
import { ChatSidebar } from './chat-sidebar';
import { ChatHeader, EmptyConversationState } from './chat-workspace-header';
import { CreateConversationDialog } from './create-conversation-dialog';
import {
  useChatConversations,
  useChatMessageSearch,
  useChatMessages,
  useMarkChatConversationRead,
  useOpenChatAttachment,
  useSendChatMessage,
  useToggleChatReaction,
  useUploadChatAttachment,
} from './hooks';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';
import { getConversationTitle, isReadOnlyChatConversation } from './utils';

interface ChatWorkspaceProps {
  className?: string;
  currentUserId: string;
  variant?: 'standalone' | 'web';
  wsId: string;
}

export function ChatWorkspace({
  className,
  currentUserId,
  variant = 'web',
  wsId,
}: ChatWorkspaceProps) {
  const t = useTranslations('chat');
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [searchValue, setSearchValue] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const conversationsQuery = useChatConversations(wsId);
  const conversations = conversationsQuery.data ?? [];
  const selectedConversation = useMemo(
    () =>
      conversations.find((item) => item.id === selectedConversationId) ??
      conversations[0] ??
      null,
    [conversations, selectedConversationId]
  );
  const activeConversationId = selectedConversation?.id ?? null;
  const selectedReadOnly = isReadOnlyChatConversation(selectedConversation);
  const messagesQuery = useChatMessages({
    conversationId: selectedReadOnly ? null : activeConversationId,
    wsId,
  });
  const messages = selectedReadOnly
    ? selectedConversation?.latestMessage
      ? [selectedConversation.latestMessage]
      : []
    : (messagesQuery.data ?? []);
  const sendMessage = useSendChatMessage({
    conversationId: activeConversationId,
    wsId,
  });
  const uploadAttachment = useUploadChatAttachment({
    conversationId: activeConversationId,
    wsId,
  });
  const openAttachment = useOpenChatAttachment({
    conversationId: activeConversationId,
    wsId,
  });
  const toggleReaction = useToggleChatReaction({
    conversationId: activeConversationId,
    wsId,
  });
  const { mutate: markConversationRead } = useMarkChatConversationRead({
    conversationId: activeConversationId,
    wsId,
  });
  const searchQuery = useChatMessageSearch({
    query: searchValue,
    wsId,
  });
  const latestMessageId = messages.at(-1)?.id ?? null;

  useEffect(() => {
    if (selectedReadOnly) return;
    if (!activeConversationId || !latestMessageId) return;
    markConversationRead(latestMessageId);
  }, [
    activeConversationId,
    latestMessageId,
    markConversationRead,
    selectedReadOnly,
  ]);

  const selectedTitle = selectedConversation
    ? getConversationTitle(selectedConversation, currentUserId, {
        ai: t('assistant_name'),
        channel: t('untitled_channel'),
        chat: t('untitled_chat'),
        direct: t('direct_message'),
        group: t('group_chat'),
      })
    : t('title');

  async function handleSend(payload: {
    attachments: ChatAttachmentDraft[];
    content: string;
  }) {
    try {
      await sendMessage.mutateAsync({
        attachments: payload.attachments,
        content: payload.content,
      });
    } catch {
      toast.error(t('message_send_failed'));
    }
  }

  async function handleOpenAttachment(attachment: ChatAttachment) {
    try {
      await openAttachment.mutateAsync(attachment.id);
    } catch {
      toast.error(t('attachment_open_failed'));
    }
  }

  return (
    <section
      className={cn(
        'flex min-h-[calc(100vh-9rem)] overflow-hidden rounded-md border bg-background text-foreground',
        variant === 'standalone' && 'min-h-screen rounded-none border-0',
        className
      )}
    >
      <ChatSidebar
        conversations={conversations}
        currentUserId={currentUserId}
        isLoading={conversationsQuery.isLoading}
        onCreateConversation={() => setCreateOpen(true)}
        onSearchChange={setSearchValue}
        onSelectConversation={setSelectedConversationId}
        searchResults={searchQuery.data ?? []}
        searchValue={searchValue}
        selectedConversationId={activeConversationId}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          conversation={selectedConversation}
          currentUserId={currentUserId}
          isFetching={messagesQuery.isFetching}
          title={selectedTitle}
        />

        {selectedConversation ? (
          <>
            <MessageList
              currentUserId={currentUserId}
              isLoading={messagesQuery.isLoading}
              messages={messages}
              onOpenAttachment={handleOpenAttachment}
              onToggleReaction={
                selectedReadOnly
                  ? undefined
                  : (messageId, emoji) =>
                      toggleReaction.mutate({ emoji, messageId })
              }
              readOnly={selectedReadOnly}
            />
            {selectedReadOnly ? (
              <div className="flex items-center justify-between gap-3 border-t bg-muted/25 px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  {t('read_only_conversation')}
                </span>
                <Badge variant="secondary">{t('agent_channel')}</Badge>
              </div>
            ) : (
              <MessageComposer
                disabled={!activeConversationId}
                isSending={sendMessage.isPending}
                isUploading={uploadAttachment.isPending}
                onSend={handleSend}
                onUploadFile={(file) => uploadAttachment.mutateAsync(file)}
              />
            )}
          </>
        ) : (
          <EmptyConversationState onCreate={() => setCreateOpen(true)} />
        )}
      </div>

      <CreateConversationDialog
        currentUserId={currentUserId}
        onCreated={(conversation) => setSelectedConversationId(conversation.id)}
        onOpenChange={setCreateOpen}
        open={createOpen}
        wsId={wsId}
      />
    </section>
  );
}
