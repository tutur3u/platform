'use client';

import {
  Bot,
  Funnel,
  Hash,
  LoaderCircle,
  MessageCircle,
  Search,
  Users,
} from '@tuturuuu/icons';
import type { ChatConversation, ChatMessage } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { Button } from '../button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import { Input } from '../input';
import { ScrollArea } from '../scroll-area';
import { ConversationRow, SearchResultList } from './chat-sidebar-items';
import type {
  ChatConversationArchiveFilter,
  ChatConversationScope,
} from './utils';

interface ChatSidebarProps {
  actions?: ReactNode;
  archiveFilter?: ChatConversationArchiveFilter;
  className?: string;
  conversations: ChatConversation[];
  currentUserId: string;
  embedded?: boolean;
  filters?: ReactNode;
  headerActions?: ReactNode;
  isLoading?: boolean;
  onSearchChange: (value: string) => void;
  onSelectConversation: (conversationId: string) => void;
  searchResults: ChatMessage[];
  scope?: ChatConversationScope;
  showControls?: boolean;
  showTitle?: boolean;
  searchValue: string;
  selectedConversationId?: string | null;
}

export function ChatSidebar({
  actions,
  archiveFilter = 'active',
  className,
  conversations,
  currentUserId,
  embedded = false,
  filters,
  headerActions,
  isLoading,
  onSearchChange,
  onSelectConversation,
  searchResults,
  scope,
  showControls = true,
  showTitle = true,
  searchValue,
  selectedConversationId,
}: ChatSidebarProps) {
  const t = useTranslations('chat');
  const [searchOpen, setSearchOpen] = useState(false);
  const showSearchResults = searchValue.trim().length >= 2;

  return (
    <aside
      className={cn(
        'flex min-h-0 w-full flex-col bg-background',
        embedded ? 'min-h-0 flex-1' : 'border-r md:w-[22rem]',
        className
      )}
    >
      {showControls ? (
        <div className="border-b p-3">
          {showTitle ? (
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-base">{t('title')}</h2>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              aria-label={t('search')}
              data-state={searchOpen ? 'open' : 'closed'}
              onClick={() => setSearchOpen((current) => !current)}
              size="icon"
              type="button"
              variant="outline"
            >
              <Search className="size-4" />
            </Button>
            {filters}
            {headerActions}
            {actions}
          </div>

          {searchOpen ? (
            <div className="relative mt-2 min-w-0 flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-9"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={t('search_placeholder')}
                value={searchValue}
              />
            </div>
          ) : null}
        </div>
      ) : null}

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
          <ConversationGroups
            conversations={conversations}
            currentUserId={currentUserId}
            onSelectConversation={onSelectConversation}
            archiveFilter={archiveFilter}
            scope={scope}
            selectedConversationId={selectedConversationId}
          />
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

function ConversationGroups({
  archiveFilter,
  conversations,
  currentUserId,
  onSelectConversation,
  scope,
  selectedConversationId,
}: {
  archiveFilter: ChatConversationArchiveFilter;
  conversations: ChatConversation[];
  currentUserId: string;
  onSelectConversation: (conversationId: string) => void;
  scope?: ChatConversationScope;
  selectedConversationId?: string | null;
}) {
  const t = useTranslations('chat');
  const groups =
    scope === 'workspaces'
      ? [
          {
            conversations: conversations.filter(
              (conversation) => conversation.type === 'channel'
            ),
            label: t('channels'),
          },
          {
            conversations: conversations.filter(
              (conversation) => conversation.type === 'ai'
            ),
            label: t('ai_agents'),
          },
        ]
      : scope === 'personal'
        ? [
            {
              conversations: conversations.filter(
                (conversation) => conversation.type === 'direct'
              ),
              label: t('direct_messages'),
            },
            {
              conversations: conversations.filter(
                (conversation) => conversation.type === 'group'
              ),
              label: t('groups'),
            },
          ]
        : [{ conversations, label: null }];

  return (
    <div className="space-y-3 p-2">
      {archiveFilter !== 'active' ? (
        <p className="px-2 text-muted-foreground text-xs">
          {archiveFilter === 'archived'
            ? t('showing_archived_chats')
            : t('showing_all_chats')}
        </p>
      ) : null}
      {groups.map((group, index) => {
        if (group.conversations.length === 0) return null;

        return (
          <section className="space-y-1" key={group.label ?? index}>
            {group.label ? (
              <h3 className="px-2 font-medium text-muted-foreground text-xs uppercase">
                {group.label}
              </h3>
            ) : null}
            {group.conversations.map((conversation) => (
              <ConversationRow
                conversation={conversation}
                currentUserId={currentUserId}
                isSelected={conversation.id === selectedConversationId}
                key={conversation.id}
                onSelectConversation={onSelectConversation}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function ChatConversationFilterMenu({
  archiveFilter,
  className,
  onArchiveFilterChange,
  onTypeToggle,
  selectedTypes,
}: {
  archiveFilter: ChatConversationArchiveFilter;
  className?: string;
  onArchiveFilterChange: (filter: ChatConversationArchiveFilter) => void;
  onTypeToggle: (type: ChatConversation['type']) => void;
  selectedTypes: ChatConversation['type'][];
}) {
  const t = useTranslations('chat');
  const selectedTypeSet = new Set(selectedTypes);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t('filter_conversations')}
          className={className}
          size="icon"
          type="button"
          variant="outline"
        >
          <Funnel className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('conversation_types')}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={selectedTypeSet.has('direct')}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') onTypeToggle('direct');
          }}
        >
          <MessageCircle className="size-4" />
          {t('direct_messages')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={selectedTypeSet.has('group')}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') onTypeToggle('group');
          }}
        >
          <Users className="size-4" />
          {t('groups')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={selectedTypeSet.has('channel')}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') onTypeToggle('channel');
          }}
        >
          <Hash className="size-4" />
          {t('channels')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={selectedTypeSet.has('ai')}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') onTypeToggle('ai');
          }}
        >
          <Bot className="size-4" />
          {t('ai_agents')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('archive')}</DropdownMenuLabel>
        {(['active', 'archived', 'all'] as const).map((filter) => (
          <DropdownMenuCheckboxItem
            checked={archiveFilter === filter}
            key={filter}
            onCheckedChange={(checked) => {
              if (typeof checked === 'boolean') onArchiveFilterChange(filter);
            }}
          >
            {t(`archive_filter_${filter}`)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
