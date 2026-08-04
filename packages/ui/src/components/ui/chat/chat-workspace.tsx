'use client';

import { Plus } from '@tuturuuu/icons';
import type {
  ChatAttachment,
  ChatAttachmentDraft,
  ChatConversation,
  ChatMessage,
} from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { toast } from '../sonner';
import { ChatAgentDetailsSidebar } from './chat-agent-details-sidebar';
import { ChatAiDetailsSidebar } from './chat-ai-details-sidebar';
import { ChatExternalContextSidebar } from './chat-external-context-sidebar';
import { ChatSharedContentSidebar } from './chat-shared-content-sidebar';
import { ChatConversationFilterMenu, ChatSidebar } from './chat-sidebar';
import { ChatHeader, EmptyConversationState } from './chat-workspace-header';
import { CreateConversationDialog } from './create-conversation-dialog';
import { FriendRequestsButton } from './friend-requests-button';
import {
  flattenChatConversationPages,
  flattenChatMessagePages,
  useChatMessageSearch,
  useChatRealtime,
  useDeleteChatConversation,
  useDeleteChatMessage,
  useGenerateChatConversationTitle,
  useInfiniteChatConversations,
  useInfiniteChatMessages,
  useMarkChatConversationRead,
  useOpenChatAttachment,
  useSendChatMessage,
  useToggleChatReaction,
  useUpdateChatConversation,
  useUploadChatAttachment,
} from './hooks';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';
import { type ChatDetailsTarget, replaceChatSelection } from './selection';
import {
  CHAT_CONVERSATION_TYPE_FILTERS,
  type ChatConversationArchiveFilter,
  type ChatConversationScope,
  canPersistChatReadState,
  filterChatConversations,
  getChatConversationTypesForScope,
  getChatSelectionStorageKey,
  getChatSourceGroupStorageKey,
  getConversationTitle,
  isReadOnlyChatConversation,
  normalizeChatConversationScope,
  type PendingChatSendRequest,
  resolveChatConversationSelection,
  resolvePendingChatSendRequest,
} from './utils';

interface ChatWorkspaceProps {
  className?: string;
  defaultConversationScope?: ChatConversationScope;
  enforcedConversationScope?: ChatConversationScope;
  currentUserId: string;
  enableRootIntegrations?: boolean;
  readOnly?: boolean;
  showSidebar?: boolean;
  variant?: 'standalone' | 'web';
  wsId: string;
}

export function ChatWorkspace({
  className,
  defaultConversationScope,
  enforcedConversationScope,
  currentUserId,
  enableRootIntegrations,
  readOnly = false,
  showSidebar = true,
  variant = 'web',
  wsId,
}: ChatWorkspaceProps) {
  const t = useTranslations('chat');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [sharedContentOpen, setSharedContentOpen] = useState(false);
  const [archiveFilter, setArchiveFilter] =
    useState<ChatConversationArchiveFilter>('active');
  const [storedConversationId, setStoredConversationId] = useState<
    string | null
  >(null);
  const [storedSelectionLoaded, setStoredSelectionLoaded] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<
    ChatConversation['type'][]
  >([...CHAT_CONVERSATION_TYPE_FILTERS]);
  const pendingSendRequest = useRef<PendingChatSendRequest | null>(null);
  const requestedScope = searchParams.get('scope');
  const conversationScope =
    enforcedConversationScope ??
    (requestedScope || defaultConversationScope
      ? normalizeChatConversationScope(
          requestedScope ?? defaultConversationScope
        )
      : null);
  const conversationsQuery = useInfiniteChatConversations({
    archived: archiveFilter,
    scope: conversationScope === 'external' ? 'external' : undefined,
    wsId,
  });
  const allConversations = flattenChatConversationPages(
    conversationsQuery.data
  );
  const conversations = conversationScope
    ? filterChatConversations({
        archiveFilter,
        conversations: allConversations,
        scope: conversationScope,
        types: selectedTypes,
      })
    : allConversations;
  const conversationIdList = useMemo(
    () => conversations.map((conversation) => conversation.id),
    [conversations]
  );
  const conversationIds = useMemo(
    () => new Set(conversationIdList),
    [conversationIdList]
  );
  const requestedConversationId = searchParams.get('conversationId');
  const selectionStorageKey = conversationScope
    ? getChatSelectionStorageKey(wsId, conversationScope)
    : null;
  const sourceGroupStorageKey = conversationScope
    ? getChatSourceGroupStorageKey(wsId, conversationScope)
    : null;
  const requestedConversationPending = Boolean(
    requestedConversationId &&
      !conversationIds.has(requestedConversationId) &&
      conversationsQuery.isFetching
  );
  const selectedConversationId = resolveChatConversationSelection({
    conversationIds: conversationIdList,
    requestedConversationId,
    storedConversationId,
  });
  const selectedConversation = useMemo(() => {
    if (requestedConversationPending) return null;

    if (selectedConversationId && conversationIds.has(selectedConversationId)) {
      return (
        conversations.find((item) => item.id === selectedConversationId) ??
        conversations[0] ??
        null
      );
    }

    return conversations[0] ?? null;
  }, [
    conversationIds,
    conversations,
    requestedConversationPending,
    selectedConversationId,
  ]);
  const activeConversationId = selectedConversation?.id ?? null;
  const activeNativeConversationId = isPostgresUuid(activeConversationId)
    ? activeConversationId
    : null;
  const conversationReadOnly = isReadOnlyChatConversation(selectedConversation);
  const selectedReadOnly = readOnly || conversationReadOnly;
  const selectedAiConversation = selectedConversation?.type === 'ai';
  const selectedAgentReadOnly =
    (selectedConversation?.metadata.source === 'ai-agent' ||
      selectedConversation?.metadata.source === 'ai-agent-external-thread') &&
    conversationReadOnly;
  const selectedVirtualReadOnly =
    selectedConversation?.metadata.source === 'ai-agent' &&
    conversationReadOnly;
  const selectedMembership =
    selectedConversation?.members.some(
      (member) => member.userId === currentUserId
    ) ?? false;
  const selectedExternalConversation =
    selectedConversation?.metadata.externalChat === true;
  const messagesQuery = useInfiniteChatMessages({
    conversationId: selectedVirtualReadOnly ? null : activeConversationId,
    wsId,
  });
  const fetchedMessages = selectedVirtualReadOnly
    ? []
    : flattenChatMessagePages(messagesQuery.data);
  const messages = selectedVirtualReadOnly
    ? selectedConversation?.latestMessage
      ? [selectedConversation.latestMessage]
      : []
    : mergeConversationLatestMessage(
        fetchedMessages,
        selectedConversation?.latestMessage
      );
  const sendMessage = useSendChatMessage({
    conversationId: activeConversationId,
    currentUserId,
    streamAssistant: selectedAiConversation,
    wsId,
  });
  const deleteConversation = useDeleteChatConversation(wsId);
  const updateConversation = useUpdateChatConversation(wsId);
  const generateConversationTitle = useGenerateChatConversationTitle(wsId);
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
  const requestedDetails = searchParams.get('details');
  const agentDetailsOpen =
    requestedDetails === 'agent' && selectedAgentReadOnly;
  const externalDetailsOpen =
    requestedDetails === 'external' && selectedExternalConversation;
  const detailsOpen = Boolean(
    (sharedContentOpen || agentDetailsOpen || externalDetailsOpen) &&
      activeConversationId
  );

  useChatRealtime(wsId);

  useEffect(() => {
    setStoredSelectionLoaded(false);
    if (!selectionStorageKey) {
      setStoredConversationId(null);
      setStoredSelectionLoaded(true);
      return;
    }

    setStoredConversationId(localStorage.getItem(selectionStorageKey));
    setStoredSelectionLoaded(true);
  }, [selectionStorageKey]);

  useEffect(() => {
    if (!activeConversationId) return;
    if (!storedSelectionLoaded && !requestedConversationId) return;
    if (requestedConversationPending) return;

    if (selectionStorageKey) {
      localStorage.setItem(selectionStorageKey, activeConversationId);
    }

    if (requestedConversationId === activeConversationId) return;

    replaceChatSelection({
      conversationId: activeConversationId,
      pathname,
      router,
      searchParams,
      storageKey: selectionStorageKey,
    });
  }, [
    activeConversationId,
    pathname,
    requestedConversationId,
    router,
    searchParams,
    selectionStorageKey,
    storedSelectionLoaded,
    requestedConversationPending,
  ]);

  useEffect(() => {
    if (
      !canPersistChatReadState({
        externalChat: selectedExternalConversation,
        hasMembership: selectedMembership,
        readOnly: conversationReadOnly,
      })
    )
      return;
    if (!activeNativeConversationId || !latestPersistedMessageId) return;
    markConversationRead(latestPersistedMessageId);
  }, [
    activeNativeConversationId,
    latestPersistedMessageId,
    markConversationRead,
    selectedMembership,
    selectedExternalConversation,
    conversationReadOnly,
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
    pendingSendRequest.current = resolvePendingChatSendRequest(
      pendingSendRequest.current,
      payload,
      () => crypto.randomUUID()
    );
    const requestId = pendingSendRequest.current.requestId;
    try {
      const result = await sendMessage.mutateAsync({
        attachments: payload.attachments,
        clientRequestId: requestId,
        content: payload.content,
      });
      if (pendingSendRequest.current?.requestId === requestId) {
        pendingSendRequest.current = null;
      }

      if (result.assistantError) {
        toast.error(t('assistant_response_failed'));
      }
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

  function selectConversation(
    conversationId: string,
    details: ChatDetailsTarget = null
  ) {
    replaceChatSelection({
      conversationId,
      details,
      pathname,
      router,
      searchParams,
      storageKey: selectionStorageKey,
    });
    setSharedContentOpen(details === 'agent');
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
    await archiveConversation(selectedConversation.id, true);
  }

  async function handleArchiveConversation(conversationId: string) {
    await archiveConversation(
      conversationId,
      conversationId === activeConversationId
    );
  }

  async function archiveConversation(
    conversationId: string,
    clearSelection: boolean
  ) {
    try {
      await deleteConversation.mutateAsync(conversationId);
      if (clearSelection) {
        replaceChatSelection({
          conversationId: null,
          pathname,
          router,
          searchParams,
          storageKey: selectionStorageKey,
        });
      }
      toast.success(t('conversation_archived'));
    } catch {
      toast.error(t('conversation_archive_failed'));
    }
  }

  async function handlePinConversation(
    conversationId: string,
    pinned: boolean
  ) {
    try {
      await updateConversation.mutateAsync({
        conversationId,
        payload: { pinned },
      });
      toast.success(
        pinned ? t('conversation_pinned') : t('conversation_unpinned')
      );
    } catch {
      toast.error(t('conversation_update_failed'));
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

  async function handleGenerateConversationTitle() {
    if (!selectedConversation) return;

    try {
      await generateConversationTitle.mutateAsync(selectedConversation.id);
      toast.success(t('conversation_updated'));
    } catch (error) {
      toast.error(t('conversation_title_generate_failed'));
      throw error;
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
            conversationScope === 'external' ? null : (
              <Button
                aria-label={t('new_conversation')}
                onClick={() => setCreateOpen(true)}
                size="icon"
                type="button"
              >
                <Plus className="size-4" />
              </Button>
            )
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
          hasMoreConversations={conversationsQuery.hasNextPage}
          isLoading={conversationsQuery.isLoading}
          isFetchingMoreConversations={conversationsQuery.isFetchingNextPage}
          onArchiveConversation={handleArchiveConversation}
          onLoadMoreConversations={() => conversationsQuery.fetchNextPage()}
          onPinConversation={handlePinConversation}
          onSearchChange={setSearchValue}
          onSelectConversation={selectConversation}
          searchResults={searchResults}
          searchValue={searchValue}
          selectedConversationId={activeConversationId}
          sourceGroupStorageKey={sourceGroupStorageKey}
          scope={conversationScope ?? undefined}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          conversation={selectedConversation}
          currentUserId={currentUserId}
          isDeletingConversation={deleteConversation.isPending}
          isFetching={messagesQuery.isFetching}
          isGeneratingConversationTitle={generateConversationTitle.isPending}
          isUpdatingConversation={updateConversation.isPending}
          onDeleteConversation={handleDeleteConversation}
          onGenerateConversationTitle={handleGenerateConversationTitle}
          onToggleSharedContent={() => {
            if (selectedExternalConversation) {
              replaceChatSelection({
                conversationId: activeConversationId,
                details: externalDetailsOpen ? null : 'external',
                pathname,
                router,
                searchParams,
                storageKey: selectionStorageKey,
              });
              return;
            }
            if (requestedDetails) {
              replaceChatSelection({
                conversationId: activeConversationId,
                pathname,
                router,
                searchParams,
                storageKey: selectionStorageKey,
              });
              setSharedContentOpen(false);
              return;
            }

            setSharedContentOpen((current) => !current);
          }}
          onUpdateConversation={handleUpdateConversation}
          sharedContentOpen={detailsOpen}
          title={selectedTitle}
        />

        {selectedConversation ? (
          <>
            <MessageList
              currentUserId={currentUserId}
              hasMoreMessages={messagesQuery.hasNextPage}
              isLoading={messagesQuery.isLoading}
              isLoadingMoreMessages={messagesQuery.isFetchingNextPage}
              isAgentTyping={selectedAiConversation && sendMessage.isPending}
              messages={messages}
              onDeleteMessage={handleDeleteMessage}
              onLoadMoreMessages={() => messagesQuery.fetchNextPage()}
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
                {selectedAgentReadOnly ? (
                  <Badge variant="secondary">{t('agent_channel')}</Badge>
                ) : null}
              </div>
            ) : (
              <MessageComposer
                allowAttachments={conversationScope !== 'external'}
                disabled={!activeConversationId}
                isSending={sendMessage.isPending}
                isUploading={uploadAttachment.isPending}
                onSend={handleSend}
                onUploadFile={(file) => uploadAttachment.mutateAsync(file)}
              />
            )}
          </>
        ) : (
          <EmptyConversationState
            onCreate={
              conversationScope === 'external'
                ? undefined
                : () => setCreateOpen(true)
            }
          />
        )}
      </div>

      {selectedExternalConversation ? (
        <ChatExternalContextSidebar
          conversationId={activeConversationId}
          open={detailsOpen}
          wsId={wsId}
        />
      ) : selectedAgentReadOnly ? (
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
        enableRootIntegrations={enableRootIntegrations}
        onCreated={handleCreated}
        onIntegrationCreated={(conversationId) =>
          selectConversation(conversationId, 'agent')
        }
        onOpenChange={setCreateOpen}
        open={createOpen}
        wsId={wsId}
      />
    </section>
  );
}

function mergeConversationLatestMessage(
  messages: ChatMessage[],
  latestMessage?: ChatMessage | null
) {
  if (
    !latestMessage ||
    messages.some((message) => message.id === latestMessage.id)
  ) {
    return messages;
  }

  return [...messages, latestMessage].sort(
    (left, right) =>
      readChatMessageTimestamp(left.createdAt) -
      readChatMessageTimestamp(right.createdAt)
  );
}

function readChatMessageTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

const POSTGRES_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function isPostgresUuid(value: string | null): value is string {
  return Boolean(value && POSTGRES_UUID_PATTERN.test(value));
}
