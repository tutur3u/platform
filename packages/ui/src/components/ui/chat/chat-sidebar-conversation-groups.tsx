'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Hash,
  LoaderCircle,
  MessageCircle,
  Users,
} from '@tuturuuu/icons';
import type { ChatConversation } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { type UIEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ConversationRow } from './chat-sidebar-items';
import {
  type ChatConversationSourceGroup,
  getChatConversationSections,
} from './chat-sidebar-sections';
import type {
  ChatConversationArchiveFilter,
  ChatConversationScope,
} from './utils';

type ConversationListItem =
  | { key: string; label: string; type: 'archive-label' }
  | {
      key: string;
      label: string;
      sectionType: ChatConversation['type'];
      type: 'group-label';
    }
  | {
      collapsed: boolean;
      group: ChatConversationSourceGroup;
      key: string;
      type: 'source-group-label';
    }
  | { conversation: ChatConversation; key: string; type: 'conversation' }
  | { key: string; type: 'loader' };

export function ConversationGroups({
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
  sourceGroupStorageKey,
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
  sourceGroupStorageKey?: string | null;
}) {
  const t = useTranslations('chat');
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [collapsedSourceGroupIds, setCollapsedSourceGroupIds] = useState<
    Set<string>
  >(new Set());
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
        sourceLabels: {
          external: t('source_external'),
          zaloPersonal: t('source_zalo_personal'),
        },
        scope,
      }),
    [conversations, scope, t]
  );

  useEffect(() => {
    setCollapsedSourceGroupIds(
      readCollapsedSourceGroupIds(sourceGroupStorageKey)
    );
  }, [sourceGroupStorageKey]);

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
      const visibleCount =
        group.conversations.length +
        group.sourceGroups.reduce(
          (count, sourceGroup) => count + sourceGroup.conversations.length,
          0
        );

      if (visibleCount === 0) continue;
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

      for (const sourceGroup of group.sourceGroups) {
        const collapsed = collapsedSourceGroupIds.has(sourceGroup.id);

        next.push({
          collapsed,
          group: sourceGroup,
          key: `source-group-${sourceGroup.id}`,
          type: 'source-group-label',
        });

        if (!collapsed) {
          for (const conversation of sourceGroup.conversations) {
            next.push({
              conversation,
              key: conversation.id,
              type: 'conversation',
            });
          }
        }
      }
    }

    if (hasMoreConversations) next.push({ key: 'loader', type: 'loader' });
    return next;
  }, [archiveFilter, collapsedSourceGroupIds, groups, hasMoreConversations, t]);

  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: (index) => {
      const item = items[index];
      if (item?.type === 'conversation') return 36;
      if (item?.type === 'loader') return 44;
      if (item?.type === 'source-group-label') return 34;
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

  function toggleSourceGroup(groupId: string) {
    setCollapsedSourceGroupIds((current) => {
      const next = new Set(current);

      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      writeCollapsedSourceGroupIds(sourceGroupStorageKey, next);

      return next;
    });
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
              ) : item.type === 'source-group-label' ? (
                <SourceGroupRow
                  collapsed={item.collapsed}
                  group={item.group}
                  onToggle={toggleSourceGroup}
                />
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

function SourceGroupRow({
  collapsed,
  group,
  onToggle,
}: {
  collapsed: boolean;
  group: ChatConversationSourceGroup;
  onToggle: (groupId: string) => void;
}) {
  const Icon = collapsed ? ChevronRight : ChevronDown;

  return (
    <button
      aria-expanded={!collapsed}
      className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
      onClick={() => onToggle(group.id)}
      type="button"
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{group.label}</span>
      <span className="shrink-0 rounded-sm border px-1.5 py-0.5 text-[0.6875rem] leading-none">
        {group.conversations.length}
      </span>
    </button>
  );
}

function readCollapsedSourceGroupIds(sourceGroupStorageKey?: string | null) {
  if (!sourceGroupStorageKey) return new Set<string>();

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(sourceGroupStorageKey) ?? '[]'
    );

    if (!Array.isArray(parsed)) return new Set<string>();

    return new Set(
      parsed.filter((value): value is string => typeof value === 'string')
    );
  } catch {
    return new Set<string>();
  }
}

function writeCollapsedSourceGroupIds(
  sourceGroupStorageKey: string | null | undefined,
  groupIds: Set<string>
) {
  if (!sourceGroupStorageKey) return;

  window.localStorage.setItem(
    sourceGroupStorageKey,
    JSON.stringify([...groupIds])
  );
}

function ConversationSectionIcon({ type }: { type: ChatConversation['type'] }) {
  const className = 'size-3.5 shrink-0';

  if (type === 'channel') return <Hash className={className} />;
  if (type === 'ai') return <Bot className={className} />;
  if (type === 'group') return <Users className={className} />;
  return <MessageCircle className={className} />;
}
