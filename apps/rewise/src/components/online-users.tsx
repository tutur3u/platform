import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { User } from '@tuturuuu/ui/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { getInitials } from '@tuturuuu/utils/name-helper';

interface PresenceUser {
  id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

interface PresenceState {
  user: PresenceUser;
  online_at: string;
  presence_ref: string;
}

interface OnlineUsersProps {
  presenceState: RealtimePresenceState<PresenceState>;
  currentUserId?: string;
}

function isValidPresence(presence: any): presence is PresenceState {
  return !!presence?.user?.id;
}

export function OnlineUsers({
  presenceState,
  currentUserId,
}: OnlineUsersProps) {
  const onlineUsers = Object.values(presenceState)
    .flatMap((presence) => presence)
    .filter(isValidPresence);

  if (!onlineUsers.length) return null;

  // Group instances by user ID and ensure user exists
  const userInstances = onlineUsers.reduce<Record<string, PresenceState[]>>(
    (acc, presence) => {
      const { user } = presence;
      if (!acc[user.id]) acc[user.id] = [];
      acc[user.id]!.push(presence);
      return acc;
    },
    {}
  );

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <div className="-space-x-3 flex overflow-visible">
          {Object.entries(userInstances).map(([userId, instances]) => {
            if (!instances?.[0]?.user) return null;
            const user = instances[0].user;

            return (
              <Tooltip key={userId}>
                <TooltipTrigger asChild>
                  <div className="relative inline-block transition-transform hover:z-10 hover:scale-110">
                    <Avatar className="relative h-8 w-8 border-2 border-background shadow-sm">
                      <AvatarImage
                        src={user.avatar_url ?? undefined}
                        className="object-cover"
                      />
                      <AvatarFallback className="text-xs">
                        {user.display_name ? (
                          getInitials(user.display_name)
                        ) : (
                          <User className="h-4 w-4" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    {instances.length > 1 && (
                      <span className="-top-0.5 -right-0.5 absolute flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 font-medium text-[10px] text-white ring-2 ring-white">
                        {instances.length}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px]">
                  <p className="text-sm">
                    {userId === currentUserId ? (
                      <span className="font-medium">
                        You in {instances.length}{' '}
                        {instances.length === 1 ? 'tab' : 'tabs'}
                      </span>
                    ) : (
                      <span>
                        {user.display_name || user.email || 'Anonymous'}
                      </span>
                    )}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="text-muted-foreground text-xs">
          {Object.keys(userInstances).length}{' '}
          {Object.keys(userInstances).length === 1
            ? 'user online'
            : 'users online'}
        </div>
      </div>
    </TooltipProvider>
  );
}
