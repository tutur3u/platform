'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
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
import { type ReactNode, type UIEvent, useMemo, useRef, useState } from 'react';
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
  hasMoreConversations?: boolean;
  isLoading?: boolean;
  isFetchingMoreConversations?: boolean;
  onArchiveConversation?: (conversationId: string) => void;
  onLoadMoreConversations?: () => Promise<unknown> | undefined;
  onPinConversation?: (conversationId: string, pinned: boolean) => void;
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
  hasMoreConversations,
  isLoading,
  isFetchingMoreConversations,
  onArchiveConversation,
  onLoadMoreConversations,
  onPinConversation,
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

      <div className="min-h-0 flex-1 overflow-hidden">
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
            hasMoreConversations={hasMoreConversations}
            isFetchingMoreConversations={isFetchingMoreConversations}
            onArchiveConversation={onArchiveConversation}
            onLoadMoreConversations={onLoadMoreConversations}
            onPinConversation={onPinConversation}
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
      </div>
    </aside>
  );
}

type ConversationListItem =
  | { key: string; label: string; type: 'archive-label' }
  | {
      key: string;
      label: string;
      sectionType: ChatConversation['type'];
      type: 'group-label';
    }
  | { conversation: ChatConversation; key: string; type: 'conversation' }
  | { key: string; type: 'loader' };

type ChatConversationSectionLabels = {
  ai: string;
  channel: string;
  direct: string;
  group: string;
};

export function getChatConversationSections({
  conversations,
  labels,
  scope,
}: {
  conversations: ChatConversation[];
  labels: ChatConversationSectionLabels;
  scope?: ChatConversationScope;
}) {
  if (scope === 'workspaces') {
    return [
      {
        conversations: conversations.filter(
          (conversation) => conversation.type === 'channel'
        ),
        label: labels.channel,
        sectionType: 'channel' as const,
      },
      {
        conversations: conversations.filter(
          (conversation) => conversation.type === 'ai'
        ),
        label: labels.ai,
        sectionType: 'ai' as const,
      },
    ];
  }

  if (scope === 'personal') {
    return [
      {
        conversations: conversations.filter(
          (conversation) => conversation.type === 'direct'
        ),
        label: labels.direct,
        sectionType: 'direct' as const,
      },
      {
        conversations: conversations.filter(
          (conversation) => conversation.type === 'group'
        ),
        label: labels.group,
        sectionType: 'group' as const,
      },
      {
        conversations: conversations.filter(
          (conversation) => conversation.type === 'ai'
        ),
        label: labels.ai,
        sectionType: 'ai' as const,
      },
    ];
  }

  return [
    {
      conversations,
      label: null,
      sectionType: 'direct' as const,
    },
  ];
}

function ConversationGroups({
  archiveFilter,
  conversations,
  currentUserId,
  hasMoreConversations,
  isFetchingMoreConversations,
  onArchiveConversation,
  onLoadMoreConversations,
  onPinConversation,
  onSelectConversation,
  scope,
  selectedConversationId,
}: {
  archiveFilter: ChatConversationArchiveFilter;
  conversations: ChatConversation[];
  currentUserId: string;
  hasMoreConversations?: boolean;
  isFetchingMoreConversations?: boolean;
  onArchiveConversation?: (conversationId: string) => void;
  onLoadMoreConversations?: () => Promise<unknown> | undefined;
  onPinConversation?: (conversationId: string, pinned: boolean) => void;
  onSelectConversation: (conversationId: string) => void;
  scope?: ChatConversationScope;
  selectedConversationId?: string | null;
}) {
  const t = useTranslations('chat');
  const parentRef = useRef<HTMLDivElement | null>(null);
  const groups = useMemo(
    () =>
      getChatConversationSections({
        conversations,
        labels: {
          ai: t('ai_agents'),
          channel: t('channels'),
          direct: t('direct_messages'),
          group: t('groups'),
        },
        scope,
      }),
    [conversations, scope, t]
  );
  const items = useMemo<ConversationListItem[]>(() => {
    const next: ConversationListItem[] = [];
    if (archiveFilter !== 'active') {
      next.push({
        key: 'archive-label',
        label:
          archiveFilter === 'archived'
            ? t('showing_archived_chats')
            : t('showing_all_chats'),
        type: 'archive-label',
      });
    }

    for (const [index, group] of groups.entries()) {
      if (group.conversations.length === 0) continue;
      if (group.label) {
        next.push({
          key: `group-${group.label}-${index}`,
          label: group.label,
          sectionType: group.sectionType,
          type: 'group-label',
        });
      }

      for (const conversation of group.conversations) {
        next.push({
          conversation,
          key: conversation.id,
          type: 'conversation',
        });
      }
    }

    if (hasMoreConversations) next.push({ key: 'loader', type: 'loader' });
    return next;
  }, [archiveFilter, groups, hasMoreConversations, t]);

  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: (index) => {
      const item = items[index];
      if (item?.type === 'conversation') return 36;
      if (item?.type === 'loader') return 44;
      return 30;
    },
    getItemKey: (index) => items[index]?.key ?? index,
    getScrollElement: () => parentRef.current,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();

  function maybeLoadMore(event: UIEvent<HTMLDivElement>) {
    if (!(hasMoreConversations && onLoadMoreConversations)) return;
    if (isFetchingMoreConversations) return;

    const target = event.currentTarget;
    const distanceToEnd =
      target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToEnd < 180) {
      void onLoadMoreConversations();
    }
  }

  return (
    <div
      className="h-full overflow-y-auto overflow-x-hidden overscroll-contain p-2"
      onScroll={maybeLoadMore}
      ref={parentRef}
    >
      <div
        className="relative"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) return null;

          return (
            <div
              className="absolute inset-x-0 top-0"
              data-index={virtualItem.index}
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              {item.type === 'archive-label' ? (
                <p className="px-2 py-1 text-muted-foreground text-xs">
                  {item.label}
                </p>
              ) : item.type === 'group-label' ? (
                <h3 className="flex items-center gap-1.5 px-2 py-1.5 font-medium text-muted-foreground text-xs uppercase">
                  <ConversationSectionIcon type={item.sectionType} />
                  {item.label}
                </h3>
              ) : item.type === 'loader' ? (
                <div className="flex items-center justify-center py-2 text-muted-foreground text-xs">
                  <LoaderCircle className="mr-2 size-3.5 animate-spin" />
                  {t('loading_conversations')}
                </div>
              ) : (
                <ConversationRow
                  conversation={item.conversation}
                  currentUserId={currentUserId}
                  isSelected={item.conversation.id === selectedConversationId}
                  onArchiveConversation={onArchiveConversation}
                  onPinConversation={onPinConversation}
                  onSelectConversation={onSelectConversation}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConversationSectionIcon({ type }: { type: ChatConversation['type'] }) {
  const className = 'size-3.5 shrink-0';

  if (type === 'channel') return <Hash className={className} />;
  if (type === 'ai') return <Bot className={className} />;
  if (type === 'group') return <Users className={className} />;
  return <MessageCircle className={className} />;
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
