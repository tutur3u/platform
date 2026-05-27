'use client';

import { LoaderCircle, MessageCircle, Plus, Search } from '@tuturuuu/icons';
import type { ChatConversation, ChatMessage } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { Button } from '../button';
import { Input } from '../input';
import { ScrollArea } from '../scroll-area';
import { ConversationRow, SearchResultList } from './chat-sidebar-items';

interface ChatSidebarProps {
  conversations: ChatConversation[];
  currentUserId: string;
  isLoading?: boolean;
  onCreateConversation: () => void;
  onSearchChange: (value: string) => void;
  onSelectConversation: (conversationId: string) => void;
  searchResults: ChatMessage[];
  searchValue: string;
  selectedConversationId?: string | null;
}

export function ChatSidebar({
  conversations,
  currentUserId,
  isLoading,
  onCreateConversation,
  onSearchChange,
  onSelectConversation,
  searchResults,
  searchValue,
  selectedConversationId,
}: ChatSidebarProps) {
  const t = useTranslations('chat');
  const showSearchResults = searchValue.trim().length >= 2;

  return (
    <aside className="flex min-h-0 w-full flex-col border-r bg-background md:w-[22rem]">
      <div className="border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-base">{t('title')}</h2>
            <p className="text-muted-foreground text-xs">
              {t('private_by_default')}
            </p>
          </div>
          <Button
            aria-label={t('new_conversation')}
            onClick={onCreateConversation}
            size="icon"
            type="button"
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="relative mt-3">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('search_placeholder')}
            value={searchValue}
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground text-sm">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {t('loading_conversations')}
          </div>
        ) : showSearchResults ? (
          <SearchResultList
            messages={searchResults}
            onSelectConversation={onSelectConversation}
          />
        ) : conversations.length > 0 ? (
          <div className="space-y-1 p-2">
            {conversations.map((conversation) => (
              <ConversationRow
                conversation={conversation}
                currentUserId={currentUserId}
                isSelected={conversation.id === selectedConversationId}
                key={conversation.id}
                onSelectConversation={onSelectConversation}
              />
            ))}
          </div>
        ) : (
          <div className="p-6 text-center">
            <MessageCircle className="mx-auto mb-3 size-8 text-muted-foreground" />
            <div className="font-medium text-sm">
              {t('empty_conversations_title')}
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('empty_conversations_description')}
            </p>
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
