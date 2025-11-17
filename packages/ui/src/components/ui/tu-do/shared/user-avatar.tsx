import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { cn } from '@tuturuuu/utils/format';

interface UserAvatarProps {
  user: {
    display_name?: string;
    avatar_url?: string;
  };
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const sizeClasses = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-5 w-5',
  md: 'h-7 w-7',
};

const fallbackSizeClasses = {
  xs: 'text-[8px]',
  sm: 'text-[9px]',
  md: 'text-xs',
};

/**
 * UserAvatar component displays a user's avatar with automatic fallback to initials.
 * Supports three size variants: xs, sm, and md.
 *
 * @example
 * ```tsx
 * <UserAvatar user={member} size="sm" />
 * ```
 */
export function UserAvatar({ user, size = 'md', className }: UserAvatarProps) {
  const displayName = user.display_name || 'Unknown';
  const initial = displayName[0]?.toUpperCase() || '?';

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      <AvatarImage src={user.avatar_url} alt={displayName} />
      <AvatarFallback className={fallbackSizeClasses[size]}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
