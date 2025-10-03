'use client';

import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import type { BoardPresenceState } from '@tuturuuu/ui/hooks/useBoardPresence';
import { User } from '@tuturuuu/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';

interface UserPresenceAvatarsProps {
  presenceState: RealtimePresenceState<BoardPresenceState>;
  currentUserId?: string;
  maxDisplay?: number;
}

export function UserPresenceAvatars({
  presenceState,
  currentUserId,
  maxDisplay = 5,
}: UserPresenceAvatarsProps) {
  const uniqueUsers = Object.entries(presenceState)
    .map(([, presences]) => presences[0]?.user)
    .filter(Boolean);

  const displayUsers = uniqueUsers.slice(0, maxDisplay);
  const remainingCount = Math.max(0, uniqueUsers.length - maxDisplay);

  // Don't render anything if no users online
  if (uniqueUsers.length === 0) return null;

  return (
    <div className="-space-x-2 flex items-center">
      {/* Avatar stack with overlap */}
      {displayUsers.map((user) => {
        if (!user || !user.id) return null;
        const isCurrentUser = user.id === currentUserId;
        const presences = presenceState[user.id] || [];
        const presenceCount = presences.length;

        return (
          <Tooltip key={user.id}>
            <TooltipTrigger asChild>
              <div className="relative transition-transform hover:z-10 hover:scale-110">
                <Avatar
                  className={cn(
                    'size-7 border-2 border-background ring-1 ring-border transition-shadow hover:ring-2 sm:size-8',
                    isCurrentUser &&
                      'ring-dynamic-blue/60 hover:ring-dynamic-blue'
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
                {/* Online indicator dot */}
                {/* <div className="-right-0.5 -bottom-0.5 absolute h-2 w-2 rounded-full border-2 border-background bg-dynamic-green sm:h-2.5 sm:w-2.5" /> */}
                {/* Multiple sessions indicator */}
                {presenceCount > 1 && (
                  <div className="-right-1 -top-1 absolute flex h-3.5 w-3.5 items-center justify-center rounded-full border border-background bg-dynamic-blue font-bold text-[9px] text-white sm:h-4 sm:w-4 sm:text-[10px]">
                    {presenceCount}
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[200px]">
              <div className="space-y-0.5">
                <p className="font-medium text-sm">
                  {user.display_name || 'Unknown User'}
                  {isCurrentUser && ' (You)'}
                </p>
                {user.email && (
                  <p className="text-muted-foreground text-xs">{user.email}</p>
                )}
                {presenceCount > 1 && (
                  <p className="text-muted-foreground text-xs">
                    {presenceCount} active sessions
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}

      {/* Overflow indicator */}
      {remainingCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative transition-transform hover:z-10 hover:scale-110">
              <Avatar className="size-7 border-2 border-background ring-1 ring-border transition-shadow hover:ring-2 sm:size-8">
                <AvatarFallback className="bg-muted font-semibold text-[10px] text-muted-foreground sm:text-xs">
                  +{remainingCount}
                </AvatarFallback>
              </Avatar>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-sm">{remainingCount} more online</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
