import type { ChatConversation } from '@tuturuuu/internal-api';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChatSidebar } from './chat-sidebar';
import { CreateConversationDialog } from './create-conversation-dialog';
import {
  flattenChatConversationPages,
  useChatMessageSearch,
  useInfiniteChatConversations,
} from './hooks';
import { type ChatDetailsTarget, replaceChatSelection } from './selection';
import {
  CHAT_CONVERSATION_TYPE_FILTERS,
  type ChatConversationArchiveFilter,
  type ChatConversationScope,
  filterChatConversations,
  filterChatConversationsByScope,
  getChatConversationTypesForScope,
  getChatSelectionStorageKey,
  getChatSourceGroupStorageKey,
  normalizeChatConversationScope,
  resolveChatConversationSelection,
} from './utils';

interface ChatSidebarPanelProps {
  archiveFilter?: ChatConversationArchiveFilter;
  closeOnMobile?: () => void;
  createOpen?: boolean;
  currentUserId: string;
  defaultConversationScope?: ChatConversationScope;
  enableRootIntegrations?: boolean;
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
  enableRootIntegrations,
  isCollapsed,
  onCreateOpenChange,
  onSearchChange,
  searchValue: controlledSearchValue,
  selectedTypes: controlledSelectedTypes,
  wsId,
}: ChatSidebarPanelProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [internalSearchValue, setInternalSearchValue] = useState('');
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const [internalArchiveFilter] =
    useState<ChatConversationArchiveFilter>('active');
  const [storedConversationId, setStoredConversationId] = useState<
    string | null
  >(null);
  const [storedSelectionLoaded, setStoredSelectionLoaded] = useState(false);
  const [internalSelectedTypes] = useState<ChatConversation['type'][]>([
    ...CHAT_CONVERSATION_TYPE_FILTERS,
  ]);
  const searchValue = controlledSearchValue ?? internalSearchValue;
  const setSearchValue = onSearchChange ?? setInternalSearchValue;
  const createOpen = controlledCreateOpen ?? internalCreateOpen;
  const setCreateOpen = onCreateOpenChange ?? setInternalCreateOpen;
  const archiveFilter = controlledArchiveFilter ?? internalArchiveFilter;
  const selectedTypes = controlledSelectedTypes ?? internalSelectedTypes;
  const conversationsQuery = useInfiniteChatConversations({
    archived: archiveFilter,
    wsId,
  });
  const searchQuery = useChatMessageSearch({
    query: searchValue,
    wsId,
  });
  const conversationScope = normalizeChatConversationScope(
    searchParams.get('scope') ?? defaultConversationScope
  );
  const conversations = flattenChatConversationPages(conversationsQuery.data);
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
  const scopedConversationIdList = scopedConversations.map(
    (conversation) => conversation.id
  );
  const scopedSearchResults = (searchQuery.data ?? []).filter((message) =>
    scopeConversations.some(
      (conversation) => conversation.id === message.conversationId
    )
  );
  const requestedConversationId = searchParams.get('conversationId');
  const selectionStorageKey = getChatSelectionStorageKey(
    wsId,
    conversationScope
  );
  const sourceGroupStorageKey = getChatSourceGroupStorageKey(
    wsId,
    conversationScope
  );
  const requestedConversationPending = Boolean(
    requestedConversationId &&
      !scopedConversationIdList.includes(requestedConversationId) &&
      conversationsQuery.isFetching
  );
  const selectedConversationId = resolveChatConversationSelection({
    conversationIds: scopedConversationIdList,
    requestedConversationId,
    storedConversationId,
  });

  useEffect(() => {
    setStoredSelectionLoaded(false);
    setStoredConversationId(localStorage.getItem(selectionStorageKey));
    setStoredSelectionLoaded(true);
  }, [selectionStorageKey]);

  useEffect(() => {
    if (!selectedConversationId) return;
    if (!storedSelectionLoaded && !requestedConversationId) return;
    if (requestedConversationPending) return;

    localStorage.setItem(selectionStorageKey, selectedConversationId);
    if (requestedConversationId === selectedConversationId) return;

    replaceChatSelection({
      conversationId: selectedConversationId,
      pathname,
      router,
      searchParams,
      storageKey: selectionStorageKey,
    });
  }, [
    pathname,
    requestedConversationId,
    router,
    searchParams,
    selectedConversationId,
    selectionStorageKey,
    storedSelectionLoaded,
    requestedConversationPending,
  ]);

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
        hasMoreConversations={conversationsQuery.hasNextPage}
        isFetchingMoreConversations={conversationsQuery.isFetchingNextPage}
        isLoading={conversationsQuery.isLoading}
        onLoadMoreConversations={() => conversationsQuery.fetchNextPage()}
        onSearchChange={setSearchValue}
        onSelectConversation={selectConversation}
        searchResults={scopedSearchResults}
        searchValue={searchValue}
        selectedConversationId={selectedConversationId}
        showControls={false}
        showTitle={false}
        sourceGroupStorageKey={sourceGroupStorageKey}
        scope={conversationScope}
      />
      <CreateConversationDialog
        allowedTypes={getChatConversationTypesForScope(conversationScope)}
        conversationScope={conversationScope}
        defaultType={getChatConversationTypesForScope(conversationScope)[0]}
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
    </>
  );
}
