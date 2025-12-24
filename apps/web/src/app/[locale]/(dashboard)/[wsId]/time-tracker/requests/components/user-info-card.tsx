import { UserIcon } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { format } from 'date-fns';
import type { ExtendedTimeTrackingRequest } from '../page';

interface UserInfoCardProps {
  request: ExtendedTimeTrackingRequest;
}

export function UserInfoCard({ request }: UserInfoCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
      {request.user ? (
        <>
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarImage src={request.user.avatar_url || ''} />
            <AvatarFallback className="bg-linear-to-br from-dynamic-blue to-dynamic-purple font-semibold text-white">
              {request.user.display_name?.[0] ||
                request.user.user_private_details.email?.[0] ||
                'U'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-foreground">
              {request.user.display_name || 'Unknown User'}
            </p>
            <p className="text-muted-foreground text-sm">
              {request.user.user_private_details.email}
            </p>
            <p className="text-muted-foreground text-xs">
              {format(new Date(request.created_at), 'MMM d, yyyy · h:mm a')}
            </p>
          </div>
        </>
      ) : (
        <>
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="bg-linear-to-br from-dynamic-blue to-dynamic-purple font-semibold text-white">
              <UserIcon className="h-6 w-6" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-foreground">Unknown User</p>
            <p className="text-muted-foreground text-xs">
              {format(new Date(request.created_at), 'MMM d, yyyy · h:mm a')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
