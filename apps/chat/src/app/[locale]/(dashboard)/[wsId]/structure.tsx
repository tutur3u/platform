'use client';

import { Plus, Search } from '@tuturuuu/icons';
import type { ChatConversation } from '@tuturuuu/internal-api';
import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import { Button } from '@tuturuuu/ui/button';
import { ChatConversationFilterMenu } from '@tuturuuu/ui/chat/chat-sidebar';
import { ChatSidebarPanel } from '@tuturuuu/ui/chat/chat-sidebar-panel';
import { FriendRequestsButton } from '@tuturuuu/ui/chat/friend-requests-button';
import {
  CHAT_CONVERSATION_TYPE_FILTERS,
  type ChatConversationArchiveFilter,
  normalizeChatConversationScope,
} from '@tuturuuu/ui/chat/utils';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { TTR_URL } from '@/constants/common';
import { ChatContextRail } from './chat-context-rail';

interface StructureProps {
  actions: ReactNode;
  children: ReactNode;
  currentUserId: string;
  defaultCollapsed: boolean;
  disableCreateNewWorkspace?: boolean;
  links: (NavLink | null)[];
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  wsId: string;
}

export function Structure({
  actions,
  children,
  currentUserId,
  defaultCollapsed = false,
  userPopover,
  workspace,
  wsId,
}: StructureProps) {
  const t = useTranslations('chat');
  const [searchValue, setSearchValue] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveFilter, setArchiveFilter] =
    useState<ChatConversationArchiveFilter>('active');
  const [selectedTypes, setSelectedTypes] = useState<
    ChatConversation['type'][]
  >([...CHAT_CONVERSATION_TYPE_FILTERS]);

  function toggleConversationType(type: ChatConversation['type']) {
    setSelectedTypes((current) => {
      if (current.includes(type)) {
        const next = current.filter((item) => item !== type);
        return next.length > 0 ? next : current;
      }

      return [...current, type];
    });
  }

  return (
    <SidebarStructure
      actions={actions}
      brand={
        <>
          <Image
            alt=""
            className="h-6 w-6 shrink-0"
            height={32}
            src="/media/logos/transparent.png"
            width={32}
          />
          <span className="min-w-0 flex-1 truncate font-semibold text-base">
            {t('title')}
          </span>
          <ChatHeaderActions
            archiveFilter={archiveFilter}
            currentUserId={currentUserId}
            onArchiveFilterChange={setArchiveFilter}
            onCreate={() => setCreateOpen(true)}
            onSearchChange={setSearchValue}
            onTypeToggle={toggleConversationType}
            searchValue={searchValue}
            selectedTypes={selectedTypes}
            wsId={wsId}
          />
        </>
      }
      collapsedBrand={
        <Image
          alt=""
          className="h-7 w-7"
          height={32}
          src="/media/logos/transparent.png"
          width={32}
        />
      }
      defaultCollapsed={defaultCollapsed}
      linkBrand={false}
      links={[]}
      mobileBrand={
        <Link
          aria-label="Home"
          className="flex flex-none items-center gap-2"
          href="/"
        >
          <Image
            alt=""
            className="h-8 w-8"
            height={32}
            src="/media/logos/transparent.png"
            width={32}
          />
        </Link>
      }
      mobileHeaderDivider={false}
      sidebarContentAfter={({ closeOnMobile, expandSidebar, isCollapsed }) =>
        isCollapsed ? (
          <ChatContextRail
            collapsed
            closeOnMobile={closeOnMobile}
            onExpand={expandSidebar}
            wsId={wsId}
          />
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <ChatContextRail closeOnMobile={closeOnMobile} wsId={wsId} />
            <div className="min-w-0 flex-1">
              <ChatSidebarPanel
                archiveFilter={archiveFilter}
                closeOnMobile={closeOnMobile}
                createOpen={createOpen}
                currentUserId={currentUserId}
                isCollapsed={isCollapsed}
                onCreateOpenChange={setCreateOpen}
                onSearchChange={setSearchValue}
                searchValue={searchValue}
                selectedTypes={selectedTypes}
                wsId={wsId}
              />
            </div>
          </div>
        )
      }
      sidebarExpandedWidth="22rem"
      sidebarHeaderClassName="border-foreground/10 border-b"
      sidebarHeaderHeight="4rem"
      showBrandOnRoot
      upgradeExternal
      upgradeHref={`${TTR_URL}/${wsId}/billing`}
      userPopover={userPopover}
      workspace={workspace}
      workspaceSelect={() => null}
      wsId={wsId}
    >
      {children}
    </SidebarStructure>
  );
}

function ChatHeaderActions({
  archiveFilter,
  currentUserId,
  onArchiveFilterChange,
  onCreate,
  onSearchChange,
  onTypeToggle,
  searchValue,
  selectedTypes,
  wsId,
}: {
  archiveFilter: ChatConversationArchiveFilter;
  currentUserId: string;
  onArchiveFilterChange: (filter: ChatConversationArchiveFilter) => void;
  onCreate: () => void;
  onSearchChange: (value: string) => void;
  onTypeToggle: (type: ChatConversation['type']) => void;
  searchValue: string;
  selectedTypes: ChatConversation['type'][];
  wsId: string;
}) {
  const t = useTranslations('chat');
  const searchParams = useSearchParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const conversationScope = normalizeChatConversationScope(
    searchParams.get('scope')
  );

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <Popover onOpenChange={setSearchOpen} open={searchOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-label={t('search')}
            className="h-9 w-9 shrink-0"
            data-active={searchValue.trim() ? true : undefined}
            size="icon"
            type="button"
            variant={searchValue.trim() ? 'secondary' : 'outline'}
          >
            <Search className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              className="h-9 pl-9"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('search_placeholder')}
              value={searchValue}
            />
          </div>
        </PopoverContent>
      </Popover>
      <ChatConversationFilterMenu
        archiveFilter={archiveFilter}
        className="h-9 w-9 shrink-0"
        onArchiveFilterChange={onArchiveFilterChange}
        onTypeToggle={onTypeToggle}
        selectedTypes={selectedTypes}
      />
      {conversationScope === 'personal' ? (
        <FriendRequestsButton
          className="h-9 w-9"
          currentUserId={currentUserId}
          wsId={wsId}
        />
      ) : null}
      <Button
        aria-label={t('new_conversation')}
        className="h-9 w-9 shrink-0"
        onClick={onCreate}
        size="icon"
        type="button"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
