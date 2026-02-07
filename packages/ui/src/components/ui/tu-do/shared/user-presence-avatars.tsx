'use client';

import {
  Moon,
  MousePointerClick,
  SquarePen,
  User as UserIcon,
} from '@tuturuuu/icons';
import type { User } from '@tuturuuu/types/primitives/User';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOptionalWorkspacePresenceContext } from '../providers/workspace-presence-provider';

// ---------------------------------------------------------------------------
// Generic presence avatar types & rendering
// ---------------------------------------------------------------------------

type ViewerMode = 'active' | 'away';

export interface PresenceViewerEntry {
  user: User;
  online_at: string;
  away?: boolean;
  presenceCount: number;
}

/**
 * Single presence avatar with tooltip (hover) and popover (click).
 * Shared UX/UI pattern: orange ring + SquarePen (active), dimmed + Moon (away).
 */
function ViewerAvatar({
  user,
  isCurrentUser,
  mode,
  presenceCount,
  compact,
  activeLabel,
  onClickUser,
}: {
  user: User;
  isCurrentUser: boolean;
  mode: ViewerMode;
  presenceCount: number;
  compact: boolean;
  activeLabel: string;
  onClickUser?: (userId: string, displayName: string) => void;
}) {
  const t = useTranslations('ws-presence');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const displayName = user.display_name || user.email || 'User';

  const modeLabel =
    mode === 'away' ? t('away') : isCurrentUser ? t('you') : activeLabel;

  // Size classes based on compact mode
  const avatarSize = compact ? 'size-5 sm:size-6' : 'size-7 sm:size-8';
  const badgeSize = compact ? 'size-2.5 sm:size-3' : 'size-3.5 sm:size-4';
  const badgeIconSize = compact ? 'size-1.5 sm:size-2' : 'size-2 sm:size-2.5';
  const fallbackTextSize = compact
    ? 'text-[7px] sm:text-[8px]'
    : 'text-[10px] sm:text-xs';
  const sessionBadgeSize = compact
    ? 'size-3 sm:size-3.5'
    : 'size-3.5 sm:size-4';
  const sessionBadgeText = compact
    ? 'text-[7px] sm:text-[8px]'
    : 'text-[8px] sm:text-[9px]';

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
                  'border-2 border-background',
                  avatarSize,
                  mode === 'active' && 'ring-2 ring-dynamic-orange/70',
                  mode === 'away' &&
                    'outline-dotted outline-2 outline-muted-foreground/30 outline-offset-0'
                )}
              >
                {user.avatar_url ? (
                  <AvatarImage src={user.avatar_url} alt={displayName} />
                ) : null}
                <AvatarFallback
                  className={cn(
                    'font-semibold',
                    fallbackTextSize,
                    mode === 'away'
                      ? 'text-muted-foreground'
                      : 'text-foreground'
                  )}
                >
                  {user.display_name || user.email ? (
                    getInitials(user.display_name || user.email)
                  ) : (
                    <UserIcon className={badgeIconSize} />
                  )}
                </AvatarFallback>
              </Avatar>

              {/* Status indicator */}
              {mode === 'away' ? (
                <span
                  className={cn(
                    'absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full border border-background bg-muted',
                    badgeSize
                  )}
                >
                  <Moon
                    className={cn(badgeIconSize, 'text-muted-foreground')}
                  />
                </span>
              ) : (
                <span
                  className={cn(
                    'absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full border border-background bg-dynamic-orange',
                    badgeSize
                  )}
                >
                  <SquarePen className={cn(badgeIconSize, 'text-white')} />
                </span>
              )}

              {/* Multiple sessions badge */}
              {presenceCount > 1 && (
                <span
                  className={cn(
                    'absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full bg-dynamic-blue font-bold text-white',
                    sessionBadgeSize,
                    sessionBadgeText
                  )}
                >
                  {presenceCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>

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
          </TooltipContent>
        )}
      </Tooltip>

      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={8}
        className="w-56 p-3"
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

        <div className="mt-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            {mode === 'away' ? (
              <Moon className="size-3 text-muted-foreground" />
            ) : (
              <SquarePen className="size-3 text-dynamic-orange" />
            )}
            <span className="text-muted-foreground">{modeLabel}</span>
          </div>
          {presenceCount > 1 && (
            <span className="text-muted-foreground">
              {t('sessions_count', { count: presenceCount })}
            </span>
          )}
        </div>

        {/* Go to cursor button — only for other active users */}
        {!isCurrentUser && mode === 'active' && onClickUser && user.id && (
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1.5 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => {
              onClickUser(user.id!, displayName);
              setPopoverOpen(false);
            }}
          >
            <MousePointerClick className="size-3" />
            {t('go_to_cursor')}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Generic presence avatar list — shared rendering for task viewers,
 * whiteboard viewers, and any future presence avatar context.
 */
export function PresenceAvatarList({
  viewers,
  currentUserId,
  maxDisplay = 5,
  compact = false,
  activeLabel = 'Online',
  onClickUser,
}: {
  viewers: PresenceViewerEntry[];
  currentUserId?: string;
  maxDisplay?: number;
  compact?: boolean;
  activeLabel?: string;
  onClickUser?: (userId: string, displayName: string) => void;
}) {
  const t = useTranslations('ws-presence');

  const sorted = [...viewers].sort((a, b) => {
    const aIsMe = a.user.id === currentUserId;
    const bIsMe = b.user.id === currentUserId;
    if (aIsMe && !bIsMe) return -1;
    if (!aIsMe && bIsMe) return 1;
    if (a.away && !b.away) return 1;
    if (!a.away && b.away) return -1;
    return 0;
  });

  const displayViewers = sorted.slice(0, maxDisplay);
  const remainingCount = Math.max(0, sorted.length - maxDisplay);

  if (viewers.length === 0) return null;

  const avatarSize = compact ? 'size-5 sm:size-6' : 'size-7 sm:size-8';
  const fallbackTextSize = compact
    ? 'text-[7px] sm:text-[8px]'
    : 'text-[10px] sm:text-xs';

  return (
    <div className="flex items-center -space-x-1.5">
      {displayViewers.map((entry) => {
        if (!entry.user.id) return null;
        const isCurrentUser = entry.user.id === currentUserId;
        const mode: ViewerMode = entry.away ? 'away' : 'active';

        return (
          <ViewerAvatar
            key={entry.user.id}
            user={entry.user}
            isCurrentUser={isCurrentUser}
            mode={mode}
            presenceCount={entry.presenceCount}
            compact={compact}
            activeLabel={activeLabel}
            onClickUser={onClickUser}
          />
        );
      })}

      {remainingCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative z-0 flex-shrink-0">
              <Avatar
                className={cn(
                  'border-2 border-background ring-1 ring-border',
                  avatarSize
                )}
              >
                <AvatarFallback
                  className={cn(
                    'bg-muted font-semibold text-muted-foreground',
                    fallbackTextSize
                  )}
                >
                  +{remainingCount}
                </AvatarFallback>
              </Avatar>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t('more_viewing', { count: remainingCount })}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task viewer connector — wires workspace presence to PresenceAvatarList
// ---------------------------------------------------------------------------

/**
 * Wrapper that connects to workspace presence context and renders task viewer avatars.
 */
export function TaskViewerAvatarsComponent({
  taskId,
  boardId,
  isViewing,
  compact = true,
  onClickUser,
}: {
  taskId: string;
  boardId?: string;
  isViewing: boolean;
  compact?: boolean;
  onClickUser?: (userId: string, displayName: string) => void;
}) {
  const t = useTranslations('ws-presence');
  const wsPresence = useOptionalWorkspacePresenceContext();
  const wasViewingRef = useRef(false);

  const wsUpdateLocation = wsPresence?.updateLocation;

  useEffect(() => {
    if (!wsUpdateLocation || !boardId) return;

    if (isViewing) {
      wasViewingRef.current = true;
      wsUpdateLocation({ type: 'board', boardId, taskId });
    } else if (wasViewingRef.current) {
      wasViewingRef.current = false;
      wsUpdateLocation({ type: 'board', boardId });
    }
  }, [wsUpdateLocation, taskId, boardId, isViewing]);

  const taskViewers = wsPresence?.getTaskViewers(taskId) ?? [];
  const currentUserId = wsPresence?.currentUserId;

  const viewers = useMemo<PresenceViewerEntry[]>(() => {
    const byUser = new Map<
      string,
      { user: User; online_at: string; away: boolean; count: number }
    >();
    for (const viewer of taskViewers) {
      const userId = viewer.user.id;
      if (!userId) continue;
      const existing = byUser.get(userId);
      if (existing) {
        existing.count++;
        if (!viewer.away) existing.away = false;
      } else {
        byUser.set(userId, {
          user: viewer.user,
          online_at: viewer.online_at,
          away: !!viewer.away,
          count: 1,
        });
      }
    }
    return Array.from(byUser.values()).map((v) => ({
      user: v.user,
      online_at: v.online_at,
      away: v.away,
      presenceCount: v.count,
    }));
  }, [taskViewers]);

  return (
    <PresenceAvatarList
      viewers={viewers}
      currentUserId={currentUserId}
      maxDisplay={5}
      compact={compact}
      activeLabel={t('viewing_this_task')}
      onClickUser={onClickUser}
    />
  );
}
