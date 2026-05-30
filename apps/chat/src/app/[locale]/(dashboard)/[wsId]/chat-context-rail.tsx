'use client';

import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Hash, LoaderCircle, MessageCircle } from '@tuturuuu/icons';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { TUTURUUU_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { ROOT_WORKSPACE_ID, toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, type UIEvent, useMemo, useRef } from 'react';
import { fetchWorkspacesPage } from './actions';

interface ChatContextRailProps {
  closeOnMobile?: () => void;
  collapsed?: boolean;
  onExpand?: () => void;
  wsId: string;
}

interface ChatWorkspacesPage {
  nextOffset: number | null;
  workspaces: InternalApiWorkspaceSummary[];
}

export function ChatContextRail({
  closeOnMobile,
  collapsed = false,
  onExpand,
  wsId,
}: ChatContextRailProps) {
  const t = useTranslations('chat');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const railScrollRef = useRef<HTMLDivElement | null>(null);
  const activeScope =
    searchParams.get('scope') === 'workspaces' ? 'workspaces' : 'personal';
  const workspacesQuery = useInfiniteQuery<
    ChatWorkspacesPage,
    Error,
    InfiniteData<ChatWorkspacesPage>,
    readonly ['chat-workspaces', 'infinite'],
    number
  >({
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    queryKey: ['chat-workspaces', 'infinite'] as const,
    queryFn: ({ pageParam }) =>
      fetchWorkspacesPage({ limit: 48, offset: pageParam }),
  });
  const workspaces = useMemo(
    () =>
      orderWorkspaces(
        workspacesQuery.data?.pages.flatMap((page) => page.workspaces) ?? []
      ),
    [workspacesQuery.data]
  );
  const personalWorkspace = workspaces.find((workspace) => workspace.personal);
  const workspaceCount =
    workspaces.length + (workspacesQuery.hasNextPage ? 1 : 0);
  const workspaceVirtualizer = useVirtualizer({
    count: workspaceCount,
    estimateSize: () => 48,
    getItemKey: (index) => workspaces[index]?.id ?? 'loader',
    getScrollElement: () => railScrollRef.current,
    overscan: 8,
  });
  const virtualWorkspaces = workspaceVirtualizer.getVirtualItems();

  function maybeLoadMoreWorkspaces(event: UIEvent<HTMLDivElement>) {
    if (!workspacesQuery.hasNextPage || workspacesQuery.isFetchingNextPage) {
      return;
    }

    const target = event.currentTarget;
    const distanceToEnd =
      target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToEnd < 160) {
      void workspacesQuery.fetchNextPage();
    }
  }

  function navigate(nextWorkspace: InternalApiWorkspaceSummary, scope: string) {
    if (collapsed) onExpand?.();

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('scope', scope);
    nextParams.delete('conversationId');
    const nextQuery = nextParams.toString();
    const nextSlug = toWorkspaceSlug(nextWorkspace.id, {
      personal: !!nextWorkspace.personal,
    });
    const nextPath = `/${nextSlug}${nextQuery ? `?${nextQuery}` : ''}`;

    if (pathname === `/${nextSlug}`) {
      window.history.replaceState(null, '', nextPath);
    } else {
      router.push(nextPath);
    }

    closeOnMobile?.();
  }

  function selectPersonal() {
    if (personalWorkspace) {
      navigate(personalWorkspace, 'personal');
      return;
    }

    if (collapsed) onExpand?.();

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('scope', 'personal');
    nextParams.delete('conversationId');
    const nextQuery = nextParams.toString();
    window.history.replaceState(
      null,
      '',
      nextQuery ? `${pathname}?${nextQuery}` : pathname
    );
    closeOnMobile?.();
  }

  return (
    <nav
      className={cn(
        'flex h-full min-h-0 shrink-0 flex-col items-center gap-2 overflow-hidden bg-muted/20 px-2 py-3',
        collapsed ? 'w-full' : 'w-14 border-r'
      )}
    >
      <RailButton
        active={activeScope === 'personal'}
        label={t('scope_personal')}
        onClick={selectPersonal}
      >
        <MessageCircle className="size-5" />
      </RailButton>

      <div className="my-1 h-px w-8 bg-border" />

      {workspacesQuery.isLoading && workspaces.length === 0 ? (
        <LoaderCircle className="mt-2 size-4 animate-spin text-muted-foreground" />
      ) : (
        <div
          className="scrollbar-none min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
          onScroll={maybeLoadMoreWorkspaces}
          ref={railScrollRef}
        >
          <div
            className="relative w-full"
            style={{ height: `${workspaceVirtualizer.getTotalSize()}px` }}
          >
            {virtualWorkspaces.map((virtualWorkspace) => {
              const workspace = workspaces[virtualWorkspace.index];

              return (
                <div
                  className="absolute inset-x-0 top-0 flex justify-center"
                  data-index={virtualWorkspace.index}
                  key={virtualWorkspace.key}
                  ref={workspaceVirtualizer.measureElement}
                  style={{
                    transform: `translateY(${virtualWorkspace.start}px)`,
                  }}
                >
                  {workspace ? (
                    <WorkspaceRailButton
                      active={
                        activeScope === 'workspaces' && workspace.id === wsId
                      }
                      onClick={() => navigate(workspace, 'workspaces')}
                      workspace={workspace}
                    />
                  ) : (
                    <div className="flex size-10 items-center justify-center">
                      <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}

function getWorkspaceRank(workspace: InternalApiWorkspaceSummary) {
  if (workspace.id === ROOT_WORKSPACE_ID) return 0;
  if (workspace.personal) return 1;
  return 2;
}

function orderWorkspaces(workspaces: InternalApiWorkspaceSummary[]) {
  return [...workspaces].sort((left, right) => {
    const rankDelta = getWorkspaceRank(left) - getWorkspaceRank(right);
    if (rankDelta !== 0) return rankDelta;

    return (left.name || '').localeCompare(right.name || '');
  });
}

function RailButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className={cn(
            'aspect-square size-10 max-h-10 min-h-10 min-w-10 max-w-10 shrink-0 rounded-md p-0 transition-colors',
            active
              ? 'bg-foreground text-background hover:bg-foreground/90'
              : 'bg-background hover:bg-accent'
          )}
          onClick={onClick}
          type="button"
          variant="ghost"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function WorkspaceRailButton({
  active,
  onClick,
  workspace,
}: {
  active: boolean;
  onClick: () => void;
  workspace: InternalApiWorkspaceSummary;
}) {
  const name = workspace.name || 'Workspace';
  const avatarUrl =
    workspace.id === ROOT_WORKSPACE_ID
      ? TUTURUUU_LOGO_URL
      : workspace.avatar_url || workspace.logo_url;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={name}
          className={cn(
            'relative flex aspect-square size-10 max-h-10 min-h-10 min-w-10 max-w-10 shrink-0 items-center justify-center rounded-md border bg-background transition-colors hover:bg-accent',
            active && 'border-foreground bg-accent'
          )}
          onClick={onClick}
          type="button"
        >
          {active ? (
            <span className="absolute -left-2 h-6 w-1 rounded-r-full bg-foreground" />
          ) : null}
          <Avatar className="aspect-square size-8 rounded-sm">
            <AvatarImage
              alt={name}
              className="h-full w-full rounded-sm object-cover"
              src={avatarUrl ?? undefined}
            />
            <AvatarFallback className="rounded-sm">
              {name ? getInitials(name) : <Hash className="size-4" />}
            </AvatarFallback>
          </Avatar>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{name}</TooltipContent>
    </Tooltip>
  );
}
