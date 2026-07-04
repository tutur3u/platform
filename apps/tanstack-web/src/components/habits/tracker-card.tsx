'use client';

import { Check, Settings2 } from '@tuturuuu/icons';
import type {
  HabitTrackerCardSummary,
  HabitTrackerEntryInput,
  HabitTrackerScope,
} from '@tuturuuu/types/primitives/HabitTracker';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { MouseEvent } from 'react';
import {
  formatCompactNumber,
  getPrimaryField,
  getTrackerColorClasses,
  getTrackerSolidClass,
  TrackerIcon,
} from './tracker-shared';

function stopEvent(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

export default function TrackerCard({
  onOpenEdit,
  onQuickLog,
  onQuickValueChange,
  onSelect,
  quickValue,
  scope,
  selected,
  tracker,
}: {
  onOpenEdit: () => void;
  onQuickLog: (input: HabitTrackerEntryInput) => void;
  onQuickValueChange: (value: string) => void;
  onSelect: () => void;
  quickValue?: string;
  scope: HabitTrackerScope;
  selected: boolean;
  tracker: HabitTrackerCardSummary;
}) {
  const t = useTranslations('habit-tracker');
  const colorClasses = getTrackerColorClasses(tracker.tracker.color);
  const solidColorClass = getTrackerSolidClass(tracker.tracker.color);
  const primaryField = getPrimaryField(tracker.tracker);
  const currentPeriodValue =
    scope === 'team'
      ? (tracker.team?.total_value ?? 0)
      : (tracker.current_member?.current_period_total ?? 0);
  const progress = Math.min(
    100,
    tracker.tracker.target_value > 0
      ? (currentPeriodValue / tracker.tracker.target_value) * 100
      : 0
  );
  const streak =
    scope === 'team'
      ? (tracker.team?.top_streak ?? 0)
      : (tracker.current_member?.streak.current_streak ?? 0);

  const selectionClasses = selected
    ? 'border-foreground/20 bg-card shadow-sm'
    : 'border-border/70 bg-card/80 hover:border-border hover:bg-card';

  return (
    <Card
      aria-pressed={selected}
      className={cn(
        'group cursor-pointer rounded-[24px] border p-4 transition-all duration-200 xl:p-3.5',
        selectionClasses
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'rounded-2xl border p-3',
            colorClasses.badge,
            colorClasses.border,
            colorClasses.text
          )}
        >
          <TrackerIcon icon={tracker.tracker.icon} />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-base">
                {tracker.tracker.name}
              </p>
              <p className="line-clamp-2 text-muted-foreground text-sm">
                {tracker.tracker.description || t('empty_description')}
              </p>
            </div>

            <Button
              aria-label={t('edit_tracker')}
              onClick={(event) => {
                stopEvent(event);
                onOpenEdit();
              }}
              size="icon"
              variant="ghost"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {tracker.tracker.target_value}{' '}
              {t(`period_${tracker.tracker.target_period}`)}
            </Badge>
            <Badge variant="secondary">
              {t(`mode_${tracker.tracker.tracking_mode}`)}
            </Badge>
            <Badge variant="secondary">
              {formatCompactNumber(streak)} {t('streak_suffix')}
            </Badge>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{t('summary.volume')}</span>
            <span className="font-medium">
              {formatCompactNumber(currentPeriodValue)} /{' '}
              {formatCompactNumber(tracker.tracker.target_value)}
              {primaryField?.unit ? ` ${primaryField.unit}` : ''}
            </span>
          </div>
          <Progress
            className="h-2.5 bg-muted/70"
            indicatorClassName={solidColorClass}
            value={progress}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border/70 bg-background/80 p-2.5 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">
              {t('current_streak')}
            </p>
            <p className="mt-1 font-semibold">{formatCompactNumber(streak)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t('best_streak')}</p>
            <p className="mt-1 font-semibold">
              {formatCompactNumber(
                tracker.current_member?.streak.best_streak ?? 0
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{t('team_members')}</p>
            <p className="mt-1 font-semibold">
              {formatCompactNumber(tracker.team?.active_members ?? 0)}
            </p>
          </div>
        </div>

        <div
          className="rounded-2xl border border-border/80 border-dashed bg-background/70 p-3"
          onClick={stopEvent}
        >
          {primaryField?.type === 'boolean' ? (
            <Button
              className="w-full"
              onClick={() =>
                onQuickLog({
                  entry_date: new Date().toISOString().slice(0, 10),
                  values: {
                    [tracker.tracker.primary_metric_key]: true,
                  },
                })
              }
            >
              <Check className="mr-2 h-4 w-4" />
              {t('complete_now')}
            </Button>
          ) : tracker.tracker.tracking_mode === 'daily_summary' ? (
            <div className="flex gap-2">
              <Input
                className="h-9"
                inputMode="decimal"
                onChange={(event) => onQuickValueChange(event.target.value)}
                placeholder={t('today_total')}
                type="number"
                value={quickValue ?? ''}
              />
              <Button
                onClick={() =>
                  onQuickLog({
                    entry_date: new Date().toISOString().slice(0, 10),
                    values: {
                      [tracker.tracker.primary_metric_key]: Number(
                        quickValue || 0
                      ),
                    },
                  })
                }
              >
                {t('save')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tracker.tracker.quick_add_values.map((value) => (
                <Button
                  key={value}
                  onClick={() =>
                    onQuickLog({
                      entry_date: new Date().toISOString().slice(0, 10),
                      values: {
                        [tracker.tracker.primary_metric_key]: value,
                      },
                    })
                  }
                  size="sm"
                  variant="outline"
                >
                  +{value}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
