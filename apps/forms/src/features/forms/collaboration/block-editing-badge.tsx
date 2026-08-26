'use client';

import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { FormCollaboratorPresence } from './channel';
import { getCollaboratorTone } from './collaborator-avatars';

/**
 * "Mai is editing" marker on a block another editor currently has focused.
 *
 * A soft signal, not a lock. The studio saves whole documents, so a hard lock
 * would have to be released reliably across crashes and lost connections to
 * avoid stranding a block — a visible warning before you start typing gets most
 * of the benefit with none of that failure mode.
 */
export function BlockEditingBadge({
  className,
  editors,
}: {
  className?: string;
  editors: FormCollaboratorPresence[];
}) {
  const t = useTranslations('forms');

  const first = editors[0];
  if (!first) {
    return null;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-dynamic-orange/30 bg-dynamic-orange/10 py-0.5 pr-2.5 pl-1.5 font-medium text-[0.7rem] text-dynamic-orange',
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          getCollaboratorTone(first.user.id)
        )}
      />
      {editors.length === 1
        ? t('collaboration.editing_now', { name: first.user.displayName })
        : t('collaboration.editing_now_multiple', { count: editors.length })}
    </span>
  );
}
