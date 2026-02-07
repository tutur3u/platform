'use client';

import { User } from '@tuturuuu/icons';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import type { UserPresenceState } from '@tuturuuu/ui/hooks/usePresence';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useEffect, useMemo } from 'react';
import { useOptionalWorkspacePresenceContext } from '../providers/workspace-presence-provider';

interface UserPresenceAvatarsProps {
  presenceState: RealtimePresenceState<UserPresenceState>;
  currentUserId?: string;
  maxDisplay?: number;
  avatarClassName?: string;
  currentUser?: {
    id: string;
    email: string;
    display_name?: string;
    avatar_url?: string;
  };
}

export function TaskViewerAvatarsComponent({
  taskId,
  boardId,
  isViewing,
}: {
  taskId: string;
  boardId?: string;
  isViewing: boolean;
}) {
  const wsPresence = useOptionalWorkspacePresenceContext();

  // Update location to include taskId when viewing
  useEffect(() => {
    if (!wsPresence) return;

    if (isViewing) {
      wsPresence.updateLocation({ type: 'board', boardId, taskId });
    } else {
      // Revert to just board location (no task)
      wsPresence.updateLocation({ type: 'board', boardId });
    }
  }, [wsPresence, taskId, boardId, isViewing]);

  const taskViewers = wsPresence?.getTaskViewers(taskId) ?? [];
  const currentUserId = wsPresence?.currentUserId;

  // Convert to presenceState format
  const presenceState: RealtimePresenceState<UserPresenceState> =
    useMemo(() => {
      const state: RealtimePresenceState<UserPresenceState> = {};
      for (const viewer of taskViewers) {
        const userId = viewer.user.id;
        if (!userId) continue;
        if (!state[userId]) state[userId] = [];
        state[userId]!.push({
          user: viewer.user,
          online_at: viewer.online_at,
          presence_ref: userId,
        });
      }
      return state;
    }, [taskViewers]);

  return (
    <UserPresenceAvatars
      presenceState={presenceState}
      currentUserId={currentUserId}
      maxDisplay={5}
      avatarClassName="size-4 sm:size-5"
    />
  );
}

export function UserPresenceAvatars({
  presenceState,
  currentUserId,
  maxDisplay = 5,
  avatarClassName,
  currentUser,
}: UserPresenceAvatarsProps) {
  const uniqueUsers = Object.entries(presenceState)
    .map(([, presences]) => presences[0]?.user)
    .filter(Boolean);

  // Check if current user is in presence state (connected)
  const currentUserInPresence = uniqueUsers.some(
    (u) => u?.id === currentUserId
  );

  // If we have currentUser prop but they're not in presence state yet, add them with a flag
  const allUsers =
    currentUser && !currentUserInPresence
      ? [{ ...currentUser, _isConnecting: true }, ...uniqueUsers]
      : uniqueUsers;

  // Sort users to place current user first
  const sortedUsers = [...allUsers].sort((a, b) => {
    const aIsCurrentUser = a?.id === currentUserId;
    const bIsCurrentUser = b?.id === currentUserId;

    if (aIsCurrentUser && !bIsCurrentUser) return -1;
    if (!aIsCurrentUser && bIsCurrentUser) return 1;
    return 0;
  });

  const displayUsers = sortedUsers.slice(0, maxDisplay);
  const remainingCount = Math.max(0, sortedUsers.length - maxDisplay);

  // Don't render anything if no users (including currentUser)
  if (allUsers.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2">
      {/* Avatar stack with overlap */}
      {displayUsers.map((user) => {
        if (!user || !user.id) return null;
        const isCurrentUser = user.id === currentUserId;
        const isConnecting = (user as any)._isConnecting;
        const presences = presenceState[user.id] || [];
        const presenceCount = presences.length;

        return (
          <HoverCard key={user.id}>
            <HoverCardTrigger asChild>
              <div
                className={cn(
                  'relative transition-all hover:z-10 hover:scale-110',
                  isConnecting ? 'opacity-40' : 'opacity-100'
                )}
              >
                <Avatar
                  className={cn(
                    'size-7 border-2 border-background ring-1 ring-border transition-shadow hover:ring-2 sm:size-8',
                    isCurrentUser &&
                      'ring-dynamic-blue/60 hover:ring-dynamic-blue',
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
                </div>
              </div>
              <div className="mt-3 border-t pt-2">
                <p className="text-muted-foreground text-xs">
                  Active sessions: {presenceCount}
                </p>
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
