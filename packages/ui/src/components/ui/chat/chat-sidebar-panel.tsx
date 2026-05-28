import type { ChatConversation } from '@tuturuuu/internal-api';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ChatSidebar } from './chat-sidebar';
import { CreateConversationDialog } from './create-conversation-dialog';
import { useChatConversations, useChatMessageSearch } from './hooks';
import {
  CHAT_CONVERSATION_TYPE_FILTERS,
  type ChatConversationArchiveFilter,
  type ChatConversationScope,
  filterChatConversations,
  filterChatConversationsByScope,
  getChatConversationTypesForScope,
  normalizeChatConversationScope,
} from './utils';

interface ChatSidebarPanelProps {
  archiveFilter?: ChatConversationArchiveFilter;
  closeOnMobile?: () => void;
  createOpen?: boolean;
  currentUserId: string;
  defaultConversationScope?: ChatConversationScope;
  isCollapsed: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  onSearchChange?: (value: string) => void;
  searchValue?: string;
  selectedTypes?: ChatConversation['type'][];
  wsId: string;
}

export function ChatSidebarPanel({
  archiveFilter: controlledArchiveFilter,
  closeOnMobile,
  createOpen: controlledCreateOpen,
  currentUserId,
  defaultConversationScope = 'personal',
  isCollapsed,
  onCreateOpenChange,
  onSearchChange,
  searchValue: controlledSearchValue,
  selectedTypes: controlledSelectedTypes,
  wsId,
}: ChatSidebarPanelProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [internalSearchValue, setInternalSearchValue] = useState('');
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const [internalArchiveFilter] =
    useState<ChatConversationArchiveFilter>('active');
  const [internalSelectedTypes] = useState<ChatConversation['type'][]>([
    ...CHAT_CONVERSATION_TYPE_FILTERS,
  ]);
  const searchValue = controlledSearchValue ?? internalSearchValue;
  const setSearchValue = onSearchChange ?? setInternalSearchValue;
  const createOpen = controlledCreateOpen ?? internalCreateOpen;
  const setCreateOpen = onCreateOpenChange ?? setInternalCreateOpen;
  const archiveFilter = controlledArchiveFilter ?? internalArchiveFilter;
  const selectedTypes = controlledSelectedTypes ?? internalSelectedTypes;
  const conversationsQuery = useChatConversations(wsId, archiveFilter);
  const searchQuery = useChatMessageSearch({
    query: searchValue,
    wsId,
  });
  const conversationScope = normalizeChatConversationScope(
    searchParams.get('scope') ?? defaultConversationScope
  );
  const conversations = conversationsQuery.data ?? [];
  const scopeConversations = filterChatConversationsByScope(
    conversations,
    conversationScope
  );
  const scopedConversations = filterChatConversations({
    archiveFilter,
    conversations,
    scope: conversationScope,
    types: selectedTypes,
  });
  const scopedConversationIds = new Set(
    scopedConversations.map((conversation) => conversation.id)
  );
  const scopedSearchResults = (searchQuery.data ?? []).filter((message) =>
    scopeConversations.some(
      (conversation) => conversation.id === message.conversationId
    )
  );
  const requestedConversationId = searchParams.get('conversationId');
  const selectedConversationId =
    requestedConversationId &&
    scopedConversationIds.has(requestedConversationId)
      ? requestedConversationId
      : (scopedConversations[0]?.id ?? null);

  function selectConversation(conversationId: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('conversationId', conversationId);
    const nextQuery = nextParams.toString();
    window.history.replaceState(
      null,
      '',
      nextQuery ? `${pathname}?${nextQuery}` : pathname
    );
    closeOnMobile?.();
  }

  function handleCreated(conversation: ChatConversation) {
    selectConversation(conversation.id);
  }

  if (isCollapsed) {
    return null;
  }

  return (
    <>
      <ChatSidebar
        archiveFilter={archiveFilter}
        conversations={scopedConversations}
        currentUserId={currentUserId}
        embedded
        isLoading={conversationsQuery.isLoading}
        onSearchChange={setSearchValue}
        onSelectConversation={selectConversation}
        searchResults={scopedSearchResults}
        searchValue={searchValue}
        selectedConversationId={selectedConversationId}
        showControls={false}
        showTitle={false}
        scope={conversationScope}
      />
      <CreateConversationDialog
        allowedTypes={getChatConversationTypesForScope(conversationScope)}
        conversationScope={conversationScope}
        defaultType={getChatConversationTypesForScope(conversationScope)[0]}
        currentUserId={currentUserId}
        onCreated={handleCreated}
        onOpenChange={setCreateOpen}
        open={createOpen}
        wsId={wsId}
      />
    </>
  );
}
