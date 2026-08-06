import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { TUTURUUU_LOGO_URL } from './tuturuuu-logo';
import { resolveWorkspaceAvatarUrl } from './workspace-select-helpers';

export function WorkspaceIcon({
  name,
  avatarUrl,
  className,
  fallbackLogoUrl = TUTURUUU_LOGO_URL,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  className?: string;
  fallbackLogoUrl?: string;
}) {
  const resolvedAvatarUrl = resolveWorkspaceAvatarUrl(avatarUrl);
  const shouldSkipFallbackOptimization = /^https?:\/\//u.test(fallbackLogoUrl);

  return (
    <Avatar
      className={cn(
        'h-5 max-h-5 min-h-5 w-5 min-w-5 max-w-5 flex-none overflow-hidden',
        resolvedAvatarUrl ? 'rounded-xs' : 'rounded-sm',
        className
      )}
    >
      <AvatarImage
        alt={name || 'Workspace'}
        className={cn(
          'h-full w-full object-cover',
          resolvedAvatarUrl ? 'rounded-xs' : 'rounded-sm'
        )}
        src={
          resolvedAvatarUrl ||
          (name ? `https://avatar.vercel.sh/${name}.png` : undefined)
        }
      />
      <AvatarFallback
        className={cn(
          'h-full w-full text-xs',
          resolvedAvatarUrl ? 'rounded-xs' : 'rounded-sm'
        )}
      >
        <Image
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
          height={20}
          src={fallbackLogoUrl}
          unoptimized={shouldSkipFallbackOptimization}
          width={20}
        />
      </AvatarFallback>
    </Avatar>
  );
}
