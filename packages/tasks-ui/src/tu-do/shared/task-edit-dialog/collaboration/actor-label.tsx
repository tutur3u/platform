'use client';

import { GitBranch } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { useTranslations } from 'next-intl';
import { isHttpsUrl } from './link-groups';
import type { TaskActor } from './types';

interface ActorLabelProps {
  actor: TaskActor | null;
  /** GitHub login of an imported author; takes precedence over `actor`. */
  externalAuthor?: string | null;
  externalUrl?: string | null;
  size?: 'sm' | 'md';
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function ActorLabel({
  actor,
  externalAuthor,
  externalUrl,
  size = 'md',
}: ActorLabelProps) {
  const t = useTranslations('task-collaboration');
  const avatarSize = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6';

  if (externalAuthor) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Avatar className={avatarSize}>
          <AvatarFallback className="text-[10px]">
            <GitBranch aria-hidden className="h-3 w-3" />
          </AvatarFallback>
        </Avatar>
        {isHttpsUrl(externalUrl) ? (
          <a
            className="font-medium text-sm hover:underline"
            href={externalUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {externalAuthor}
          </a>
        ) : (
          <span className="font-medium text-sm">{externalAuthor}</span>
        )}
        <span className="rounded-sm border px-1 text-[10px] text-muted-foreground">
          {t('github')}
        </span>
      </span>
    );
  }

  const name = actor?.display_name || t('unknown_user');
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar className={avatarSize}>
        <AvatarImage alt={name} src={actor?.avatar_url || undefined} />
        <AvatarFallback className="text-[10px]">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="font-medium text-sm">{name}</span>
    </span>
  );
}
