'use client';

import { Eye, User } from '@tuturuuu/icons';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import type { UserPresenceState } from '@tuturuuu/ui/hooks/usePresence';
import { usePresence } from '@tuturuuu/ui/hooks/usePresence';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import type { BoardFiltersMetadata, TaskFilters } from './task-filter.types';

export type ListStatusFilter = 'all' | 'active' | 'not_started';

interface BoardUserPresenceAvatarsProps {
  presenceState: RealtimePresenceState<UserPresenceState>;
  currentUserId?: string;
  currentMetadata?: BoardFiltersMetadata;
  maxDisplay?: number;
  avatarClassName?: string;
  applyUserBoardView: (metadata: BoardFiltersMetadata) => void;
}

/**
 * Efficiently compares two sorted arrays of primitive values
 */
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
  if (!metadata1 || !metadata2) return true; // Show all cursors if no metadata

  // Check list status filter
  if (metadata1.listStatusFilter !== metadata2.listStatusFilter) return false;

  const f1 = metadata1.filters;
  const f2 = metadata2.filters;

  // Check sort option
  if (f1.sortBy !== f2.sortBy) return false;

  // Check label filters (compare IDs)
  const labels1 = f1.labels.map((l) => l.id).sort();
  const labels2 = f2.labels.map((l) => l.id).sort();
  if (!arraysEqual(labels1, labels2)) return false;

  // Check assignee filters (compare IDs)
  const assignees1 = f1.assignees.map((a) => a.id).sort();
  const assignees2 = f2.assignees.map((a) => a.id).sort();
  if (!arraysEqual(assignees1, assignees2)) return false;

  // Check project filters (compare IDs)
  const projects1 = f1.projects.map((p) => p.id).sort();
  const projects2 = f2.projects.map((p) => p.id).sort();
  if (!arraysEqual(projects1, projects2)) return false;

  // Check priority filters
  const priorities1 = [...f1.priorities].sort();
  const priorities2 = [...f2.priorities].sort();
  if (!arraysEqual(priorities1, priorities2)) return false;

  // Check due date range
  const date1From = f1.dueDateRange?.from?.getTime();
  const date1To = f1.dueDateRange?.to?.getTime();
  const date2From = f2.dueDateRange?.from?.getTime();
  const date2To = f2.dueDateRange?.to?.getTime();
  if (date1From !== date2From || date1To !== date2To) return false;

  // Check estimation range
  if (
    f1.estimationRange?.min !== f2.estimationRange?.min ||
    f1.estimationRange?.max !== f2.estimationRange?.max
  )
    return false;

  // Check boolean flags
  if (f1.includeUnassigned !== f2.includeUnassigned) return false;

  // Don't compare searchQuery as it's too volatile for cursor filtering
  return true;
}

/**
 * Component for board-specific presence avatars with navigation functionality.
 * Uses composition pattern to extend base avatar behavior without modifying shared components.
 */
export function BoardUserPresenceAvatarsComponent({
  channelName,
  currentMetadata,
  onFiltersChange,
  onListStatusFilterChange,
}: {
  channelName: string;
  currentMetadata?: BoardFiltersMetadata;
  onFiltersChange: (filters: TaskFilters) => void;
  onListStatusFilterChange: (filter: ListStatusFilter) => void;
}) {
  const { presenceState, currentUserId } = usePresence(
    channelName,
    currentMetadata
  );

  const applyUserBoardView = (metadata: BoardFiltersMetadata) => {
    // Apply list status filter
    if (metadata?.listStatusFilter) {
      onListStatusFilterChange(metadata.listStatusFilter as ListStatusFilter);
    }

    const shouldIncludeMyTasks =
      metadata?.filters?.assignees?.some((a) => a.id === currentUserId) ||
      false;

    // Apply filters
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
    />
  );
}

export function BoardUserPresenceAvatars({
  presenceState,
  currentUserId,
  currentMetadata,
  maxDisplay = 5,
  avatarClassName,
  applyUserBoardView,
}: BoardUserPresenceAvatarsProps) {
  const uniqueUsers = Object.entries(presenceState)
    .map(([, presences]) => presences[0])
    .filter(Boolean);

  // Sort users to place current user first
  const sortedUsers = [...uniqueUsers].sort((a, b) => {
    const aIsCurrentUser = a?.user?.id === currentUserId;
    const bIsCurrentUser = b?.user?.id === currentUserId;

    if (aIsCurrentUser && !bIsCurrentUser) return -1;
    if (!aIsCurrentUser && bIsCurrentUser) return 1;
    return 0;
  });

  const displayUsers = sortedUsers.slice(0, maxDisplay);
  const remainingCount = Math.max(0, sortedUsers.length - maxDisplay);

  // Don't render anything if no users online
  if (uniqueUsers.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2">
      {/* Avatar stack with overlap */}
      {displayUsers.map((presence) => {
        const user = presence?.user;
        if (!user || !user.id) return null;

        const isCurrentUser = user.id === currentUserId;
        const presences = presenceState[user.id] || [];
        const presenceCount = presences.length;

        // Check if user's view matches current user's view
        const userMetadata = presence.metadata as
          | BoardFiltersMetadata
          | undefined;
        const hasMatchingFilters = isMatchingFilters(
          currentMetadata,
          userMetadata
        );

        return (
          <HoverCard key={user.id}>
            <HoverCardTrigger asChild>
              <div className="relative transition-transform hover:z-10 hover:scale-110">
                <Avatar
                  className={cn(
                    'size-7 border-2 border-background transition-all sm:size-8',
                    // Same view users and current user: solid ring
                    hasMatchingFilters && 'ring-1 ring-border hover:ring-2',
                    // Current user: blue ring
                    isCurrentUser &&
                      'opacity-60 outline-2 outline-dynamic-light-cyan outline-offset-0 hover:opacity-80 hover:outline-dynamic-light-cyan',
                    // Different view users: dashed outline + opacity
                    !hasMatchingFilters &&
                      !isCurrentUser &&
                      'opacity-60 outline-dashed outline-2 outline-dynamic-light-pink outline-offset-0 hover:opacity-80 hover:outline-dynamic-light-pink',
                    avatarClassName
                  )}
                >
                  {user.avatar_url ? (
                    <AvatarImage
                      src={user.avatar_url}
                      alt={user.display_name || user.email || 'User'}
                    />
                  ) : null}
                  <AvatarFallback className="font-semibold text-[10px] text-foreground sm:text-xs">
                    {user.display_name || user.email ? (
                      getInitials(user.display_name || user.email)
                    ) : (
                      <User className="h-3 w-3 sm:h-4 sm:w-4" />
                    )}
                  </AvatarFallback>
                </Avatar>
                {presenceCount > 1 && (
                  <div className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-background bg-dynamic-blue font-bold text-[9px] text-white sm:h-4 sm:w-4 sm:text-[10px]">
                    {presenceCount}
                  </div>
                )}
              </div>
            </HoverCardTrigger>
            <HoverCardContent side="bottom" className="w-80">
              <div className="flex gap-3">
                <Avatar className="size-10">
                  {user.avatar_url ? (
                    <AvatarImage
                      src={user.avatar_url}
                      alt={user.display_name || user.email || 'User'}
                    />
                  ) : null}
                  <AvatarFallback className="font-semibold text-foreground text-sm">
                    {user.display_name || user.email ? (
                      getInitials(user.display_name || user.email)
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <p className="font-medium text-sm">
                    {user.display_name || 'Unknown User'}
                    {isCurrentUser && ' (You)'}
                  </p>
                  {user.email && (
                    <p className="text-muted-foreground text-xs">
                      {user.email}
                    </p>
                  )}
                  {!isCurrentUser && userMetadata && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <p
                        className={cn(
                          'text-xs',
                          hasMatchingFilters
                            ? 'text-dynamic-green/90'
                            : 'text-muted-foreground'
                        )}
                      >
                        {hasMatchingFilters
                          ? 'Same view as you'
                          : 'Different view'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 space-y-2 border-t pt-2">
                <p className="text-muted-foreground text-xs">
                  Active sessions: {presenceCount}
                </p>
                {!isCurrentUser && userMetadata && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-2 text-xs"
                    onClick={() => applyUserBoardView(userMetadata)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View their board filters
                  </Button>
                )}
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      })}

      {/* Overflow indicator */}
      {remainingCount > 0 && (
        <HoverCard>
          <HoverCardTrigger asChild>
            <div className="relative transition-transform hover:z-10 hover:scale-110">
              <Avatar className="size-7 border-2 border-background ring-1 ring-border transition-shadow hover:ring-2 sm:size-8">
                <AvatarFallback className="bg-muted font-semibold text-[10px] text-muted-foreground sm:text-xs">
                  +{remainingCount}
                </AvatarFallback>
              </Avatar>
            </div>
          </HoverCardTrigger>
          <HoverCardContent side="bottom">
            <p className="text-sm">{remainingCount} more online</p>
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  );
}
