'use client';

import { CopyPlus, MoreHorizontal, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';

/** Duplicate (same day, +1 or +2 weeks) and remove for one session row. */
export function ScheduleRowActions({
  hasTopic,
  onDuplicate,
  onRemove,
}: {
  hasTopic: boolean;
  onDuplicate: (days: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('ws-topic-announcements');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t('schedule_row_actions')}
          className="h-7 w-7"
          size="icon"
          variant="ghost"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onDuplicate(0)}>
          <CopyPlus className="mr-2 h-4 w-4" />
          {t('schedule_duplicate')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDuplicate(7)}>
          <CopyPlus className="mr-2 h-4 w-4" />
          {t('schedule_duplicate_next_week')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDuplicate(14)}>
          <CopyPlus className="mr-2 h-4 w-4" />
          {t('schedule_duplicate_two_weeks')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-dynamic-red" onSelect={onRemove}>
          <Trash2 className="mr-2 h-4 w-4" />
          {hasTopic ? t('schedule_remove_with_topic') : t('schedule_remove')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
