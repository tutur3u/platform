'use client';

import { Eye, Moon, SquarePen, User as UserIcon } from '@tuturuuu/icons';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import type { UserPresenceState } from '@tuturuuu/ui/hooks/usePresence';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useTaskDialog } from '../hooks/useTaskDialog';
import { useTaskDialogContext } from '../providers/task-dialog-provider';
import { useOptionalWorkspacePresenceContext } from '../providers/workspace-presence-provider';
import type { BoardFiltersMetadata, TaskFilters } from './task-filter.types';

export type ListStatusFilter = 'all' | 'active' | 'not_started';

/**
 * Presence mode determines the avatar visual style:
 * - `active-same`: Solid cyan ring — user is active with matching filters
 * - `active-different`: Dashed pink ring — user is active with different filters
 * - `active-task`: Solid orange ring — user is viewing a specific task
 * - `away`: Reduced opacity, darkened, dotted ring, sleep icon — tab hidden
 */
type PresenceMode = 'active-same' | 'active-different' | 'active-task' | 'away';

interface BoardUserPresenceAvatarsProps {
  presenceState: RealtimePresenceState<UserPresenceState>;
  currentUserId?: string;
  currentMetadata?: BoardFiltersMetadata;
  maxDisplay?: number;
  applyUserBoardView: (metadata: BoardFiltersMetadata) => void;
  onOpenTask?: (taskId: string) => Promise<void>;
}

function arraysEqual<T extends string | number>(arr1: T[], arr2: T[]): boolean {
  if (arr1.length !== arr2.length) return false;
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
}

function isMatchingFilters(
  metadata1?: BoardFiltersMetadata,
  metadata2?: BoardFiltersMetadata
): boolean {
  if (!metadata1 || !metadata2) return true;
  if (metadata1.listStatusFilter !== metadata2.listStatusFilter) return false;

  const f1 = metadata1.filters;
  const f2 = metadata2.filters;

  if (f1.sortBy !== f2.sortBy) return false;

  const labels1 = f1.labels.map((l) => l.id).sort();
  const labels2 = f2.labels.map((l) => l.id).sort();
  if (!arraysEqual(labels1, labels2)) return false;

  const assignees1 = f1.assignees.map((a) => a.id).sort();
  const assignees2 = f2.assignees.map((a) => a.id).sort();
  if (!arraysEqual(assignees1, assignees2)) return false;

  const projects1 = f1.projects.map((p) => p.id).sort();
  const projects2 = f2.projects.map((p) => p.id).sort();
  if (!arraysEqual(projects1, projects2)) return false;

  const priorities1 = [...f1.priorities].sort();
  const priorities2 = [...f2.priorities].sort();
  if (!arraysEqual(priorities1, priorities2)) return false;

  const date1From = f1.dueDateRange?.from?.getTime();
  const date1To = f1.dueDateRange?.to?.getTime();
  const date2From = f2.dueDateRange?.from?.getTime();
  const date2To = f2.dueDateRange?.to?.getTime();
  if (date1From !== date2From || date1To !== date2To) return false;

  if (
    f1.estimationRange?.min !== f2.estimationRange?.min ||
    f1.estimationRange?.max !== f2.estimationRange?.max
  )
    return false;

  if (f1.includeUnassigned !== f2.includeUnassigned) return false;

  return true;
}

/**
 * Wrapper that connects to workspace presence context and renders avatars.
 */
export function BoardUserPresenceAvatarsComponent({
  boardId,
  currentMetadata,
  onFiltersChange,
  onListStatusFilterChange,
}: {
  boardId: string;
  currentMetadata?: BoardFiltersMetadata;
  onFiltersChange: (filters: TaskFilters) => void;
  onListStatusFilterChange: (filter: ListStatusFilter) => void;
}) {
  const wsPresence = useOptionalWorkspacePresenceContext();
  const { openTaskById } = useTaskDialog();
  const { state: dialogState } = useTaskDialogContext();

  // Extract stable function refs to avoid re-running effects on every context change
  const wsUpdateLocation = wsPresence?.updateLocation;
  const wsUpdateMetadata = wsPresence?.updateMetadata;

  // Derive dialog props — only track task presence when editing a real task
  const dialogOpen = dialogState.isOpen;
  const dialogTaskId =
    dialogState.mode === 'edit' && dialogState.task?.id !== 'new'
      ? dialogState.task?.id
      : undefined;

  // Single-writer effect: centralize all location updates here to prevent
  // race conditions between multiple TaskViewerAvatarsComponent instances.
  // When the dialog is open with a real task → track { board, boardId, taskId }
  // Otherwise → track { board, boardId } (board-level only)
  useEffect(() => {
    if (!wsUpdateLocation || !boardId) return;
    if (dialogOpen && dialogTaskId) {
      wsUpdateLocation({ type: 'board', boardId, taskId: dialogTaskId });
    } else {
      wsUpdateLocation({ type: 'board', boardId });
    }
  }, [wsUpdateLocation, boardId, dialogOpen, dialogTaskId]);

  // Update metadata (filters) separately so it doesn't overwrite task-level location
  useEffect(() => {
    if (!wsUpdateMetadata || !currentMetadata) return;
    wsUpdateMetadata(currentMetadata as Record<string, any>);
  }, [wsUpdateMetadata, currentMetadata]);

  const boardViewers = wsPresence?.getBoardViewers(boardId) ?? [];
  const currentUserId = wsPresence?.currentUserId;

  const presenceState: RealtimePresenceState<UserPresenceState> =
    useMemo(() => {
      const state: RealtimePresenceState<UserPresenceState> = {};
      for (const viewer of boardViewers) {
        const userId = viewer.user.id;
        if (!userId) continue;
        if (!state[userId]) state[userId] = [];
        state[userId]!.push({
          user: viewer.user,
          online_at: viewer.online_at,
          metadata: {
            ...viewer.metadata,
            _away: viewer.away,
            _viewingTaskId: viewer.location?.taskId,
          },
          presence_ref: userId,
        });
      }
      return state;
    }, [boardViewers]);

  const applyUserBoardView = (metadata: BoardFiltersMetadata) => {
    if (metadata?.listStatusFilter) {
      onListStatusFilterChange(metadata.listStatusFilter as ListStatusFilter);
    }

    const shouldIncludeMyTasks =
      metadata?.filters?.assignees?.some((a) => a.id === currentUserId) ||
      false;

    if (metadata?.filters) {
      onFiltersChange({
        ...metadata.filters,
        includeMyTasks: shouldIncludeMyTasks,
      });
    }
  };

  return (
    <BoardUserPresenceAvatars
      presenceState={presenceState}
      currentUserId={currentUserId}
      currentMetadata={currentMetadata}
      maxDisplay={5}
      applyUserBoardView={applyUserBoardView}
      onOpenTask={openTaskById}
    />
  );
}

/**
 * Resolves the visual mode for a presence avatar.
 */
function resolvePresenceMode(
  isCurrentUser: boolean,
  isAway: boolean,
  hasMatchingFilters: boolean,
  isViewingTask: boolean
): PresenceMode {
  // Current user is never shown as "away" (they're looking at their own screen)
  if (isCurrentUser) return isViewingTask ? 'active-task' : 'active-same';
  if (isAway) return 'away';
  if (isViewingTask) return 'active-task';
  return hasMatchingFilters ? 'active-same' : 'active-different';
}

/**
 * Individual presence avatar with tooltip (hover) and popover (click).
 * Fixed-size container prevents layout shift.
 */
function PresenceAvatar({
  user,
  isCurrentUser,
  mode,
  presenceCount,
  userMetadata,
  viewingTaskId,
  applyUserBoardView,
  onOpenTask,
}: {
  user: User;
  isCurrentUser: boolean;
  mode: PresenceMode;
  presenceCount: number;
  userMetadata?: BoardFiltersMetadata;
  viewingTaskId?: string;
  applyUserBoardView: (metadata: BoardFiltersMetadata) => void;
  onOpenTask?: (taskId: string) => Promise<void>;
}) {
  const t = useTranslations('ws-presence');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const displayName = user.display_name || user.email || 'User';

  const modeLabel =
    mode === 'away'
      ? t('away')
      : mode === 'active-task'
        ? isCurrentUser
          ? t('viewing_task')
          : t('viewing_a_task')
        : mode === 'active-same'
          ? isCurrentUser
            ? t('you')
            : t('same_view')
          : t('different_view');

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'relative z-0 flex-shrink-0 rounded-full outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring',
                'hover:z-10',
                popoverOpen && 'z-10',
                mode === 'away' && 'opacity-50 grayscale-[40%]'
              )}
            >
              <Avatar
                className={cn(
                  'size-7 border-2 border-background sm:size-8',
                  // Mode: active-same — solid cyan ring
                  mode === 'active-same' && 'ring-2 ring-dynamic-cyan/70',
                  // Mode: active-different — dashed pink ring
                  mode === 'active-different' &&
                    'outline-dashed outline-2 outline-dynamic-pink/60 outline-offset-0',
                  // Mode: active-task — solid orange ring
                  mode === 'active-task' && 'ring-2 ring-dynamic-orange/70',
                  // Mode: away — dotted ring with muted color
                  mode === 'away' &&
                    'outline-dotted outline-2 outline-muted-foreground/30 outline-offset-0'
                )}
              >
                {user.avatar_url ? (
                  <AvatarImage src={user.avatar_url} alt={displayName} />
                ) : null}
                <AvatarFallback
                  className={cn(
                    'font-semibold text-[10px] sm:text-xs',
                    mode === 'away'
                      ? 'text-muted-foreground'
                      : 'text-foreground'
                  )}
                >
                  {user.display_name || user.email ? (
                    getInitials(user.display_name || user.email)
                  ) : (
                    <UserIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                </AvatarFallback>
              </Avatar>

              {/* Status indicator */}
              {mode === 'away' ? (
                // Sleep icon for away users
                <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full border border-background bg-muted sm:size-4">
                  <Moon className="size-2 text-muted-foreground sm:size-2.5" />
                </span>
              ) : mode === 'active-task' ? (
                // Edit icon for task viewers
                <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full border border-background bg-dynamic-orange sm:size-4">
                  <SquarePen className="size-2 text-white sm:size-2.5" />
                </span>
              ) : (
                // Online dot for active users
                <span
                  className={cn(
                    'absolute right-0 bottom-0 block size-2 rounded-full border border-background sm:size-2.5',
                    mode === 'active-same'
                      ? 'bg-dynamic-cyan'
                      : 'bg-dynamic-pink'
                  )}
                />
              )}

              {/* Multiple sessions badge */}
              {presenceCount > 1 && (
                <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-dynamic-blue font-bold text-[8px] text-white sm:size-4 sm:text-[9px]">
                  {presenceCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        {/* Lightweight tooltip — hidden when popover is open */}
        {!popoverOpen && (
          <TooltipContent side="bottom" className="text-xs">
            <span>{displayName}</span>
            {isCurrentUser && (
              <span className="text-muted-foreground"> ({t('you')})</span>
            )}
            {mode === 'away' && (
              <span className="text-muted-foreground">
                {' '}
                &middot; {t('away')}
              </span>
            )}
            {mode === 'active-task' && !isCurrentUser && (
              <span className="text-muted-foreground">
                {' '}
                &middot; {t('viewing_a_task')}
              </span>
            )}
          </TooltipContent>
        )}
      </Tooltip>

      {/* Detailed popover on click */}
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={8}
        className="w-64 p-3"
      >
        <div className="flex items-center gap-2.5">
          <Avatar
            className={cn(
              'size-9 ring-1',
              mode === 'away'
                ? 'opacity-60 ring-muted grayscale-[40%]'
                : 'ring-border'
            )}
          >
            {user.avatar_url ? (
              <AvatarImage src={user.avatar_url} alt={displayName} />
            ) : null}
            <AvatarFallback className="font-semibold text-foreground text-xs">
              {user.display_name || user.email ? (
                getInitials(user.display_name || user.email)
              ) : (
                <UserIcon className="h-4 w-4" />
              )}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm leading-tight">
              {user.display_name || 'Unknown User'}
              {isCurrentUser && (
                <span className="ml-1 font-normal text-muted-foreground text-xs">
                  ({t('you')})
                </span>
              )}
            </p>
            {user.email && (
              <p className="truncate text-muted-foreground text-xs leading-tight">
                {user.email}
              </p>
            )}
          </div>
        </div>

        {/* Status row */}
        <div className="mt-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            {mode === 'away' ? (
              <Moon className="size-3 text-muted-foreground" />
            ) : mode === 'active-task' ? (
              <SquarePen className="size-3 text-dynamic-orange" />
            ) : (
              <span
                className={cn(
                  'block size-1.5 rounded-full',
                  mode === 'active-same' ? 'bg-dynamic-cyan' : 'bg-dynamic-pink'
                )}
              />
            )}
            <span className="text-muted-foreground">{modeLabel}</span>
          </div>
          {presenceCount > 1 && (
            <span className="text-muted-foreground">
              {t('sessions_count', { count: presenceCount })}
            </span>
          )}
        </div>

        {/* Action: apply their filters (only when they have different filters) */}
        {!isCurrentUser && userMetadata && mode === 'active-different' && (
          <Button
            size="sm"
            variant="outline"
            className="mt-2.5 h-7 w-full gap-1.5 text-xs"
            onClick={() => {
              applyUserBoardView(userMetadata);
              setPopoverOpen(false);
            }}
          >
            <Eye className="h-3 w-3" />
            {t('apply_their_filters')}
          </Button>
        )}

        {/* Action: open the task they're viewing */}
        {!isCurrentUser &&
          mode === 'active-task' &&
          viewingTaskId &&
          onOpenTask && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2.5 h-7 w-full gap-1.5 text-xs"
              onClick={() => {
                onOpenTask(viewingTaskId);
                setPopoverOpen(false);
              }}
            >
              <SquarePen className="h-3 w-3" />
              {t('open_their_task')}
            </Button>
          )}
      </PopoverContent>
    </Popover>
  );
}

export function BoardUserPresenceAvatars({
  presenceState,
  currentUserId,
  currentMetadata,
  maxDisplay = 5,
  applyUserBoardView,
  onOpenTask,
}: BoardUserPresenceAvatarsProps) {
  const t = useTranslations('ws-presence');
  const uniqueUsers = Object.entries(presenceState)
    .map(([, presences]) => presences[0])
    .filter(Boolean);

  // Sort: current user first, then active users, then task viewers, then away users
  const sortedUsers = [...uniqueUsers].sort((a, b) => {
    const aIsCurrentUser = a?.user?.id === currentUserId;
    const bIsCurrentUser = b?.user?.id === currentUserId;
    if (aIsCurrentUser && !bIsCurrentUser) return -1;
    if (!aIsCurrentUser && bIsCurrentUser) return 1;

    const aAway = !!(a?.metadata as any)?._away;
    const bAway = !!(b?.metadata as any)?._away;
    if (aAway && !bAway) return 1;
    if (!aAway && bAway) return -1;

    return 0;
  });

  const displayUsers = sortedUsers.slice(0, maxDisplay);
  const remainingCount = Math.max(0, sortedUsers.length - maxDisplay);

  if (uniqueUsers.length === 0) return null;

  return (
    <div className="flex items-center -space-x-1.5">
      {displayUsers.map((presence) => {
        const user = presence?.user;
        if (!user || !user.id) return null;

        const isCurrentUser = user.id === currentUserId;
        const presences = presenceState[user.id] || [];
        const presenceCount = presences.length;
        const isAway = !!(presence.metadata as any)?._away;
        const isViewingTask = !!(presence.metadata as any)?._viewingTaskId;
        const userMetadata = presence.metadata as
          | BoardFiltersMetadata
          | undefined;
        const hasMatchingFilters = isMatchingFilters(
          currentMetadata,
          userMetadata
        );
        const mode = resolvePresenceMode(
          isCurrentUser,
          isAway,
          hasMatchingFilters,
          isViewingTask
        );

        const viewingTaskId = (presence.metadata as any)?._viewingTaskId as
          | string
          | undefined;

        return (
          <PresenceAvatar
            key={user.id}
            user={user}
            isCurrentUser={isCurrentUser}
            mode={mode}
            presenceCount={presenceCount}
            userMetadata={userMetadata}
            viewingTaskId={viewingTaskId}
            applyUserBoardView={applyUserBoardView}
            onOpenTask={onOpenTask}
          />
        );
      })}

      {/* Overflow count */}
      {remainingCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative z-0 flex-shrink-0">
              <Avatar className="size-7 border-2 border-background ring-1 ring-border sm:size-8">
                <AvatarFallback className="bg-muted font-semibold text-[10px] text-muted-foreground sm:text-xs">
                  +{remainingCount}
                </AvatarFallback>
              </Avatar>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t('more_online', { count: remainingCount })}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
