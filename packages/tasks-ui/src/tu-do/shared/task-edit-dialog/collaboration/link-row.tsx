'use client';

import { X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { toSafeHref } from '../../../fleet/fleet-task-meta';
import { LinkKindIcon } from './link-kind-icon';
import { LinkStateBadge } from './link-state-badge';
import type { TaskLink } from './types';

function displayLabel(link: TaskLink) {
  if (link.title) return link.title;
  if (link.external_id) {
    return link.kind === 'commit'
      ? link.external_id.slice(0, 7)
      : `#${link.external_id}`;
  }
  return link.url.replace(/^https:\/\//, '');
}

interface LinkRowProps {
  link: TaskLink;
  canRemove: boolean;
  removing?: boolean;
  onRemove: (id: string) => void;
}

export function LinkRow({ link, canRemove, removing, onRemove }: LinkRowProps) {
  const t = useTranslations('task-collaboration');
  const label = displayLabel(link);
  const href = toSafeHref(link.url);
  const removableId = !link.legacy ? link.id : null;

  return (
    <li
      className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
      data-testid="task-link"
    >
      <LinkKindIcon
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        kind={link.kind}
      />
      {href ? (
        <a
          className="min-w-0 flex-1 truncate text-sm hover:underline"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
          title={link.url}
        >
          {label}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      )}
      <LinkStateBadge state={link.state} />
      {link.legacy && (
        <span className="shrink-0 text-muted-foreground text-xs">
          {t('legacy_link_hint')}
        </span>
      )}
      {canRemove && removableId && (
        <Button
          aria-label={t('remove_link')}
          className="h-6 w-6 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          disabled={removing}
          onClick={() => onRemove(removableId)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  );
}
