'use client';

import { Plus } from '@tuturuuu/icons';
import type {
  ChatAttachment,
  ChatAttachmentDraft,
  ChatConversation,
} from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { toast } from '../sonner';
import { ChatAgentDetailsSidebar } from './chat-agent-details-sidebar';
import { ChatAiDetailsSidebar } from './chat-ai-details-sidebar';
import { ChatSharedContentSidebar } from './chat-shared-content-sidebar';
import { ChatConversationFilterMenu, ChatSidebar } from './chat-sidebar';
import { ChatHeader, EmptyConversationState } from './chat-workspace-header';
import { CreateConversationDialog } from './create-conversation-dialog';
import { FriendRequestsButton } from './friend-requests-button';
import {
  useChatConversations,
  useChatMessageSearch,
  useChatMessages,
  useChatRealtime,
  useDeleteChatConversation,
  useDeleteChatMessage,
  useMarkChatConversationRead,
  useOpenChatAttachment,
  useSendChatMessage,
  useToggleChatReaction,
  useUpdateChatConversation,
  useUploadChatAttachment,
} from './hooks';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';
import {
  CHAT_CONVERSATION_TYPE_FILTERS,
  type ChatConversationArchiveFilter,
  type ChatConversationScope,
  filterChatConversations,
  getChatConversationTypesForScope,
  getConversationTitle,
  isReadOnlyChatConversation,
  normalizeChatConversationScope,
} from './utils';

interface ChatWorkspaceProps {
  className?: string;
  defaultConversationScope?: ChatConversationScope;
  currentUserId: string;
  showSidebar?: boolean;
  variant?: 'standalone' | 'web';
  wsId: string;
}

export function ChatWorkspace({
  className,
  defaultConversationScope,
  currentUserId,
  showSidebar = true,
  variant = 'web',
  wsId,
}: ChatWorkspaceProps) {
  const t = useTranslations('chat');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [sharedContentOpen, setSharedContentOpen] = useState(false);
  const [archiveFilter, setArchiveFilter] =
    useState<ChatConversationArchiveFilter>('active');
  const [selectedTypes, setSelectedTypes] = useState<
    ChatConversation['type'][]
  >([...CHAT_CONVERSATION_TYPE_FILTERS]);
  const conversationsQuery = useChatConversations(wsId, archiveFilter);
  const allConversations = conversationsQuery.data ?? [];
  const requestedScope = searchParams.get('scope');
  const conversationScope =
    requestedScope || defaultConversationScope
      ? normalizeChatConversationScope(
          requestedScope ?? defaultConversationScope
        )
      : null;
  const conversations = conversationScope
    ? filterChatConversations({
        archiveFilter,
        conversations: allConversations,
        scope: conversationScope,
        types: selectedTypes,
      })
    : allConversations;
  const conversationIds = useMemo(
    () => new Set(conversations.map((conversation) => conversation.id)),
    [conversations]
  );
  const selectedConversationId = searchParams.get('conversationId');
  const selectedConversation = useMemo(
    () =>
      (selectedConversationId && conversationIds.has(selectedConversationId)
        ? conversations.find((item) => item.id === selectedConversationId)
        : null) ??
      conversations[0] ??
      null,
    [conversationIds, conversations, selectedConversationId]
  );
  const activeConversationId = selectedConversation?.id ?? null;
  const selectedReadOnly = isReadOnlyChatConversation(selectedConversation);
  const selectedAiConversation = selectedConversation?.type === 'ai';
  const selectedVirtualReadOnly =
    selectedConversation?.metadata.source === 'ai-agent' && selectedReadOnly;
  const selectedMembership =
    selectedConversation?.members.some(
      (member) => member.userId === currentUserId
    ) ?? false;
  const messagesQuery = useChatMessages({
    conversationId: selectedVirtualReadOnly ? null : activeConversationId,
    wsId,
  });
  const messages = selectedVirtualReadOnly
    ? selectedConversation?.latestMessage
      ? [selectedConversation.latestMessage]
      : []
    : (messagesQuery.data ?? []);
  const sendMessage = useSendChatMessage({
    conversationId: activeConversationId,
    currentUserId,
    streamAssistant: selectedAiConversation,
    wsId,
  });
  const deleteConversation = useDeleteChatConversation(wsId);
  const updateConversation = useUpdateChatConversation(wsId);
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
  const deleteMessage = useDeleteChatMessage({
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
  const searchResults = (searchQuery.data ?? []).filter(
    (message) =>
      !conversationScope ||
      conversations.some(
        (conversation) => conversation.id === message.conversationId
      )
  );
  const latestMessageId = messages.at(-1)?.id ?? null;
  const latestPersistedMessageId = isPostgresUuid(latestMessageId)
    ? latestMessageId
    : null;
  const detailsOpen = Boolean(sharedContentOpen && activeConversationId);

  useChatRealtime(wsId);

  useEffect(() => {
    if (selectedReadOnly) return;
    if (!selectedMembership) return;
    if (!activeConversationId || !latestPersistedMessageId) return;
    markConversationRead(latestPersistedMessageId);
  }, [
    activeConversationId,
    latestPersistedMessageId,
    markConversationRead,
    selectedMembership,
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
    } catch (error) {
      toast.error(t('message_send_failed'));
      throw error;
    }
  }

  async function handleOpenAttachment(attachment: ChatAttachment) {
    try {
      await openAttachment.mutateAsync(attachment.id);
    } catch {
      toast.error(t('attachment_open_failed'));
    }
  }

  async function handleDeleteMessage(messageId: string) {
    try {
      await deleteMessage.mutateAsync(messageId);
      toast.success(t('message_deleted_success'));
    } catch {
      toast.error(t('message_delete_failed'));
    }
  }

  function selectConversation(conversationId: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('conversationId', conversationId);
    const nextQuery = nextParams.toString();
    window.history.replaceState(
      null,
      '',
      nextQuery ? `${pathname}?${nextQuery}` : pathname
    );
  }

  function handleCreated(conversation: ChatConversation) {
    selectConversation(conversation.id);
  }

  function toggleType(type: ChatConversation['type']) {
    setSelectedTypes((current) => {
      if (current.includes(type)) {
        const next = current.filter((item) => item !== type);
        return next.length > 0 ? next : current;
      }

      return [...current, type];
    });
  }

  async function handleDeleteConversation() {
    if (!selectedConversation) return;

    try {
      await deleteConversation.mutateAsync(selectedConversation.id);
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete('conversationId');
      const nextQuery = nextParams.toString();
      window.history.replaceState(
        null,
        '',
        nextQuery ? `${pathname}?${nextQuery}` : pathname
      );
      toast.success(t('conversation_archived'));
    } catch {
      toast.error(t('conversation_archive_failed'));
    }
  }

  async function handleUpdateConversation(payload: {
    description?: string | null;
    title?: string | null;
  }) {
    if (!selectedConversation) return;

    try {
      await updateConversation.mutateAsync({
        conversationId: selectedConversation.id,
        payload,
      });
      toast.success(t('conversation_updated'));
    } catch {
      toast.error(t('conversation_update_failed'));
    }
  }

  return (
    <section
      className={cn(
        'flex h-full min-h-[calc(100vh-9rem)] overflow-hidden rounded-md border bg-background text-foreground',
        variant === 'standalone' && 'min-h-dvh rounded-none border-0',
        className
      )}
    >
      {showSidebar ? (
        <ChatSidebar
          actions={
            <Button
              aria-label={t('new_conversation')}
              onClick={() => setCreateOpen(true)}
              size="icon"
              type="button"
            >
              <Plus className="size-4" />
            </Button>
          }
          archiveFilter={archiveFilter}
          conversations={conversations}
          currentUserId={currentUserId}
          filters={
            <ChatConversationFilterMenu
              archiveFilter={archiveFilter}
              onArchiveFilterChange={setArchiveFilter}
              onTypeToggle={toggleType}
              selectedTypes={selectedTypes}
            />
          }
          headerActions={
            conversationScope === 'personal' ? (
              <FriendRequestsButton currentUserId={currentUserId} wsId={wsId} />
            ) : null
          }
          isLoading={conversationsQuery.isLoading}
          onSearchChange={setSearchValue}
          onSelectConversation={selectConversation}
          searchResults={searchResults}
          searchValue={searchValue}
          selectedConversationId={activeConversationId}
          scope={conversationScope ?? undefined}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          conversation={selectedConversation}
          currentUserId={currentUserId}
          isDeletingConversation={deleteConversation.isPending}
          isFetching={messagesQuery.isFetching}
          isUpdatingConversation={updateConversation.isPending}
          onDeleteConversation={handleDeleteConversation}
          onToggleSharedContent={() =>
            setSharedContentOpen((current) => !current)
          }
          onUpdateConversation={handleUpdateConversation}
          sharedContentOpen={sharedContentOpen}
          title={selectedTitle}
        />

        {selectedConversation ? (
          <>
            <MessageList
              currentUserId={currentUserId}
              isLoading={messagesQuery.isLoading}
              isAgentTyping={selectedAiConversation && sendMessage.isPending}
              messages={messages}
              onDeleteMessage={handleDeleteMessage}
              onOpenAttachment={handleOpenAttachment}
              onToggleReaction={
                selectedReadOnly || selectedAiConversation
                  ? undefined
                  : (messageId, emoji) =>
                      toggleReaction.mutate({ emoji, messageId })
              }
              readOnly={selectedReadOnly}
              wsId={wsId}
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

      {selectedVirtualReadOnly ? (
        <ChatAgentDetailsSidebar
          conversation={selectedConversation}
          open={detailsOpen}
        />
      ) : selectedAiConversation ? (
        <ChatAiDetailsSidebar
          conversationId={activeConversationId}
          onOpenAttachment={handleOpenAttachment}
          open={detailsOpen}
          wsId={wsId}
        />
      ) : (
        <ChatSharedContentSidebar
          conversationId={activeConversationId}
          onOpenAttachment={handleOpenAttachment}
          open={detailsOpen}
          wsId={wsId}
        />
      )}

      <CreateConversationDialog
        allowedTypes={
          conversationScope
            ? getChatConversationTypesForScope(conversationScope)
            : undefined
        }
        conversationScope={conversationScope ?? undefined}
        defaultType={
          conversationScope
            ? getChatConversationTypesForScope(conversationScope)[0]
            : undefined
        }
        currentUserId={currentUserId}
        onCreated={handleCreated}
        onOpenChange={setCreateOpen}
        open={createOpen}
        wsId={wsId}
      />
    </section>
  );
}

const POSTGRES_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function isPostgresUuid(value: string | null): value is string {
  return Boolean(value && POSTGRES_UUID_PATTERN.test(value));
}
