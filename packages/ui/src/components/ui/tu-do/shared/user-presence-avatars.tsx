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

  return (
    <div className="flex items-center gap-1.5">
      {/* Avatar stack */}
      {displayUsers.map((user) => {
        if (!user || !user.id) return null;
        const isCurrentUser = user.id === currentUserId;
        const presences = presenceState[user.id] || [];
        const presenceCount = presences.length;

        return (
          <Tooltip key={user.id}>
            <TooltipTrigger asChild>
              <div className="relative">
                <Avatar
                  className={cn(
                    'size-8 border-2 border-background ring-2 ring-background transition-all hover:scale-110',
                    isCurrentUser && 'ring-dynamic-blue/50'
                  )}
                >
                  {user.avatar_url ? (
                    <AvatarImage
                      src={user.avatar_url}
                      alt={user.display_name || user.email || 'User'}
                    />
                  ) : null}
                  <AvatarFallback className="font-semibold text-foreground text-xs">
                    {user.display_name || user.email ? (
                      getInitials(user.display_name || user.email)
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </AvatarFallback>
                </Avatar>
                {/* Online indicator dot */}
                <div className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-dynamic-green" />
                {/* Multiple sessions indicator */}
                {presenceCount > 1 && (
                  <div className="-right-1 -top-1 absolute flex h-4 w-4 items-center justify-center rounded-full border border-background bg-dynamic-blue text-[10px] text-white">
                    {presenceCount}
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[200px]">
              <div className="space-y-1">
                <p className="font-medium text-sm">
                  {user.display_name || 'Unknown User'}
                  {isCurrentUser && ' (You)'}
                </p>
                {user.email && (
                  <p className="text-muted-foreground text-xs">{user.email}</p>
                )}
                <p className="text-muted-foreground text-xs">
                  Active in {presenceCount} session
                  {presenceCount > 1 ? 's' : ''}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}

      {/* Overflow indicator */}
      {remainingCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <Avatar className="size-8 border-2 border-background ring-2 ring-background transition-all hover:z-10 hover:scale-110">
                <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                  +{remainingCount}
                </AvatarFallback>
              </Avatar>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-sm">
              {remainingCount} more user{remainingCount > 1 ? 's' : ''} online
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
