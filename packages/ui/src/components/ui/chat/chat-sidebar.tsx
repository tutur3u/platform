'use client';

import { LoaderCircle, MessageCircle, Plus, Search } from '@tuturuuu/icons';
import type { ChatConversation, ChatMessage } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { Button } from '../button';
import { Input } from '../input';
import { ScrollArea } from '../scroll-area';
import { ConversationRow, SearchResultList } from './chat-sidebar-items';

interface ChatSidebarProps {
  className?: string;
  conversations: ChatConversation[];
  currentUserId: string;
  embedded?: boolean;
  isLoading?: boolean;
  onCreateConversation: () => void;
  onSearchChange: (value: string) => void;
  onSelectConversation: (conversationId: string) => void;
  searchResults: ChatMessage[];
  showTitle?: boolean;
  searchValue: string;
  selectedConversationId?: string | null;
}

export function ChatSidebar({
  className,
  conversations,
  currentUserId,
  embedded = false,
  isLoading,
  onCreateConversation,
  onSearchChange,
  onSelectConversation,
  searchResults,
  showTitle = true,
  searchValue,
  selectedConversationId,
}: ChatSidebarProps) {
  const t = useTranslations('chat');
  const showSearchResults = searchValue.trim().length >= 2;

  return (
    <aside
      className={cn(
        'flex min-h-0 w-full flex-col bg-background',
        embedded
          ? 'min-h-0 flex-1 border-foreground/10 border-t'
          : 'border-r md:w-[22rem]',
        className
      )}
    >
      <div className="border-b p-3">
        {showTitle ? (
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-base">{t('title')}</h2>
            <Button
              aria-label={t('new_conversation')}
              onClick={onCreateConversation}
              size="icon"
              type="button"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('search_placeholder')}
              value={searchValue}
            />
          </div>
          {!showTitle ? (
            <Button
              aria-label={t('new_conversation')}
              onClick={onCreateConversation}
              size="icon"
              type="button"
            >
              <Plus className="size-4" />
            </Button>
          ) : null}
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
