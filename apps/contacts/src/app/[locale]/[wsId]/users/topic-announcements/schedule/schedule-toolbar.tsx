'use client';

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Plus,
  UserX,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { formatScheduleMonth } from './schedule-format';

export type ScheduleFilter = 'all' | 'needs_gvnn';

interface Props {
  changeCount: number;
  filter: ScheduleFilter;
  isLoading: boolean;
  isSaving: boolean;
  missingCount: number;
  month: string;
  onAdd: () => void;
  onClone: () => void;
  onDiscard: () => void;
  onFilterChange: (filter: ScheduleFilter) => void;
  onMonthChange: (delta: number) => void;
  onSave: () => void;
  sessionCount: number;
}

export function ScheduleToolbar({
  changeCount,
  filter,
  isLoading,
  isSaving,
  missingCount,
  month,
  onAdd,
  onClone,
  onDiscard,
  onFilterChange,
  onMonthChange,
  onSave,
  sessionCount,
}: Props) {
  const t = useTranslations('ws-topic-announcements');
  const locale = useLocale();
  const needsGvnnActive = filter === 'needs_gvnn';

  return (
    <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-1">
        <Button
          aria-label={t('schedule_previous_month')}
          onClick={() => onMonthChange(-1)}
          size="icon"
          variant="ghost"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-40 items-center justify-center gap-2 font-semibold">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="capitalize">
            {formatScheduleMonth(month, locale)}
          </span>
        </div>
        <Button
          aria-label={t('schedule_next_month')}
          onClick={() => onMonthChange(1)}
          size="icon"
          variant="ghost"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <span className="text-muted-foreground text-sm tabular-nums">
        {t('schedule_session_count', { count: sessionCount })}
      </span>

      <Button
        aria-pressed={needsGvnnActive}
        className={cn(
          'gap-2',
          missingCount > 0 && 'border-dynamic-orange/40 text-dynamic-orange',
          needsGvnnActive && 'bg-dynamic-orange/10'
        )}
        disabled={isLoading || (missingCount === 0 && !needsGvnnActive)}
        onClick={() => onFilterChange(needsGvnnActive ? 'all' : 'needs_gvnn')}
        size="sm"
        variant="outline"
      >
        <UserX className="h-4 w-4" />
        {t('schedule_needs_gvnn')}
        <Badge
          className="h-5 min-w-5 justify-center px-1.5"
          variant="secondary"
        >
          {missingCount}
        </Badge>
      </Button>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          className="gap-2"
          disabled={isLoading}
          onClick={onClone}
          size="sm"
          variant="outline"
        >
          <Copy className="h-4 w-4" />
          {t('schedule_clone_previous')}
        </Button>
        <Button
          className="gap-2"
          disabled={isLoading}
          onClick={onAdd}
          size="sm"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          {t('schedule_add_session')}
        </Button>
        {changeCount > 0 ? (
          <Button
            disabled={isSaving}
            onClick={onDiscard}
            size="sm"
            variant="ghost"
          >
            {t('schedule_discard')}
          </Button>
        ) : null}
        <Button
          className="gap-2"
          disabled={changeCount === 0 || isSaving}
          onClick={onSave}
          size="sm"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {changeCount > 0
            ? t('schedule_save_changes', { count: changeCount })
            : t('schedule_saved_state')}
        </Button>
      </div>
    </div>
  );
}
