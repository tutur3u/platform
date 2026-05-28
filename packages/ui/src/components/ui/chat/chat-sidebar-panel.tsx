'use client';

import type { ChatConversation } from '@tuturuuu/internal-api';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ChatSidebar } from './chat-sidebar';
import { CreateConversationDialog } from './create-conversation-dialog';
import { FriendRequestsPanel } from './friend-requests-panel';
import { useChatConversations, useChatMessageSearch } from './hooks';
import {
  type ChatConversationScope,
  filterChatConversationsByScope,
  getChatConversationTypesForScope,
  normalizeChatConversationScope,
} from './utils';

interface ChatSidebarPanelProps {
  closeOnMobile?: () => void;
  currentUserId: string;
  defaultConversationScope?: ChatConversationScope;
  isCollapsed: boolean;
  wsId: string;
}

export function ChatSidebarPanel({
  closeOnMobile,
  currentUserId,
  defaultConversationScope = 'personal',
  isCollapsed,
  wsId,
}: ChatSidebarPanelProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const conversationsQuery = useChatConversations(wsId);
  const searchQuery = useChatMessageSearch({
    query: searchValue,
    wsId,
  });
  const conversationScope = normalizeChatConversationScope(
    searchParams.get('scope') ?? defaultConversationScope
  );
  const conversations = conversationsQuery.data ?? [];
  const scopedConversations = filterChatConversationsByScope(
    conversations,
    conversationScope
  );
  const scopedConversationIds = new Set(
    scopedConversations.map((conversation) => conversation.id)
  );
  const scopedSearchResults = (searchQuery.data ?? []).filter((message) =>
    scopedConversationIds.has(message.conversationId)
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
        conversations={scopedConversations}
        currentUserId={currentUserId}
        embedded
        isLoading={conversationsQuery.isLoading}
        onCreateConversation={() => setCreateOpen(true)}
        onSearchChange={setSearchValue}
        onSelectConversation={selectConversation}
        searchResults={scopedSearchResults}
        searchValue={searchValue}
        selectedConversationId={selectedConversationId}
        showTitle={false}
      />
      {conversationScope === 'personal' ? (
        <FriendRequestsPanel currentUserId={currentUserId} wsId={wsId} />
      ) : null}
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
