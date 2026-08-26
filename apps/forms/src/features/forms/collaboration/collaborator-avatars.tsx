'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { FormCollaboratorPresence } from './channel';

/**
 * Deterministic per-user tint.
 *
 * Colour has to survive a reload and agree across every client, so it is
 * derived from the user id rather than assigned by arrival order — otherwise
 * two people would see the same collaborator in different colours.
 */
const AVATAR_TONES = [
  'bg-dynamic-purple',
  'bg-dynamic-blue',
  'bg-dynamic-green',
  'bg-dynamic-orange',
  'bg-dynamic-pink',
  'bg-dynamic-cyan',
] as const;

export function getCollaboratorTone(userId: string) {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }

  return AVATAR_TONES[hash % AVATAR_TONES.length] as string;
}

function getInitials(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts.at(-1)![0]}`.toUpperCase();
}

const MAX_VISIBLE = 4;

/** Stacked avatars for everyone else currently in the studio. */
export function CollaboratorAvatars({
  className,
  collaborators,
  isConnected,
}: {
  className?: string;
  collaborators: FormCollaboratorPresence[];
  isConnected: boolean;
}) {
  const t = useTranslations('forms');

  if (!isConnected || collaborators.length === 0) {
    return null;
  }

  const visible = collaborators.slice(0, MAX_VISIBLE);
  const overflow = collaborators.length - visible.length;

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-full border border-border/60 bg-background/70 py-1 pr-3 pl-1.5',
          className
        )}
      >
        <div className="flex -space-x-2">
          {visible.map((collaborator) => (
            <Tooltip key={`${collaborator.user.id}:${collaborator.sessionId}`}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex transition-opacity',
                    collaborator.away && 'opacity-40'
                  )}
                >
                  <Avatar className="h-7 w-7 border-2 border-background">
                    {collaborator.user.avatarUrl ? (
                      <AvatarImage
                        alt={collaborator.user.displayName}
                        src={collaborator.user.avatarUrl}
                      />
                    ) : null}
                    <AvatarFallback
                      className={cn(
                        'font-medium text-[0.6rem] text-white',
                        getCollaboratorTone(collaborator.user.id)
                      )}
                    >
                      {getInitials(collaborator.user.displayName)}
                    </AvatarFallback>
                  </Avatar>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">{collaborator.user.displayName}</p>
                <p className="text-muted-foreground text-xs">
                  {collaborator.away
                    ? t('collaboration.away')
                    : collaborator.blockLabel
                      ? t('collaboration.editing_block', {
                          block: collaborator.blockLabel,
                        })
                      : t('collaboration.viewing')}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}

          {overflow > 0 ? (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted font-medium text-[0.6rem] text-muted-foreground">
              +{overflow}
            </span>
          ) : null}
        </div>

        <span className="text-muted-foreground text-xs">
          {t('collaboration.editor_count', { count: collaborators.length })}
        </span>
      </div>
    </TooltipProvider>
  );
}
