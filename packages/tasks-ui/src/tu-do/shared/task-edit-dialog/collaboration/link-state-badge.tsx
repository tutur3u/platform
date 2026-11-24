'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { LINK_STATE_CLASS } from './link-groups';
import type { TaskLinkState } from './types';

export function LinkStateBadge({ state }: { state: TaskLinkState | null }) {
  const t = useTranslations('task-collaboration');
  if (!state) return null;

  return (
    <Badge
      className={cn(
        'h-5 shrink-0 px-1.5 font-medium text-[10px]',
        LINK_STATE_CLASS[state]
      )}
      variant="outline"
    >
      {t(`link_state.${state}`)}
    </Badge>
  );
}
