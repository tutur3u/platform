'use client';

import { Clock, Plus, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { QuickWeeklyDayPicker } from './quick-weekly-day-picker';
import {
  createQuickWeeklySchedulePattern,
  type QuickWeeklySchedulePattern,
} from './quick-weekly-schedule-utils';

export function QuickWeeklyPatternFields({
  onChange,
  patterns,
}: {
  onChange: (patterns: QuickWeeklySchedulePattern[]) => void;
  patterns: QuickWeeklySchedulePattern[];
}) {
  const t = useTranslations('ws-user-group-schedule');
  const updatePattern = (
    id: string,
    changes: Partial<QuickWeeklySchedulePattern>
  ) =>
    onChange(
      patterns.map((pattern) =>
        pattern.id === id ? { ...pattern, ...changes } : pattern
      )
    );
  const nextPatternIndex = patterns.reduce((highest, pattern) => {
    const suffix = Number(pattern.id.replace('timeframe-', ''));
    return Number.isFinite(suffix) ? Math.max(highest, suffix) : highest;
  }, 0);

  return (
    <div className="space-y-3 md:col-span-2">
      <div>
        <Label>{t('timeframes')}</Label>
        <p className="mt-1 text-muted-foreground text-xs">
          {t('timeframes_help')}
        </p>
      </div>
      {patterns.map((pattern, index) => (
        <section
          key={pattern.id}
          className="space-y-4 rounded-xl border bg-background p-3 sm:p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-medium text-sm">
              {t('timeframe_number', { count: index + 1 })}
            </h4>
            {patterns.length > 1 ? (
              <Button
                aria-label={t('remove_timeframe', { count: index + 1 })}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() =>
                  onChange(patterns.filter((item) => item.id !== pattern.id))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <QuickWeeklyDayPicker
            daysOfWeek={pattern.daysOfWeek}
            onChange={(daysOfWeek) => updatePattern(pattern.id, { daysOfWeek })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${pattern.id}-start`}>
                {t('timeframe_start')}
              </Label>
              <div className="relative">
                <Clock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  id={`${pattern.id}-start`}
                  type="time"
                  value={pattern.startTime}
                  onChange={(event) =>
                    updatePattern(pattern.id, { startTime: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${pattern.id}-end`}>{t('timeframe_end')}</Label>
              <div className="relative">
                <Clock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  id={`${pattern.id}-end`}
                  type="time"
                  value={pattern.endTime}
                  onChange={(event) =>
                    updatePattern(pattern.id, { endTime: event.target.value })
                  }
                />
              </div>
            </div>
          </div>
        </section>
      ))}
      <Button
        className="w-full border-dashed"
        type="button"
        variant="outline"
        onClick={() =>
          onChange([
            ...patterns,
            createQuickWeeklySchedulePattern(nextPatternIndex),
          ])
        }
      >
        <Plus className="h-4 w-4" />
        {t('add_timeframe')}
      </Button>
    </div>
  );
}
