'use client';

import { Briefcase, Calendar, User } from '@tuturuuu/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useFormatter, useTranslations } from 'next-intl';
import type { DayTimeRange, WeekTimeRanges } from './hour-settings-shared';

type HoursOverviewProps = {
  workHours?: WeekTimeRanges | null;
  meetingHours?: WeekTimeRanges | null;
  personalHours?: WeekTimeRanges | null;
};

const HOUR_TYPE_CONFIG = [
  {
    key: 'work',
    bg: 'bg-dynamic-blue/70',
    hoverBg: 'hover:bg-dynamic-blue',
    translationKey: 'work',
    icon: Briefcase,
  },
  {
    key: 'meeting',
    bg: 'bg-dynamic-cyan/70',
    hoverBg: 'hover:bg-dynamic-cyan',
    translationKey: 'meeting',
    icon: Calendar,
  },
  {
    key: 'personal',
    bg: 'bg-dynamic-green/70',
    hoverBg: 'hover:bg-dynamic-green',
    translationKey: 'personal',
    icon: User,
  },
] as const;

const DAYS: Array<keyof WeekTimeRanges> = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function timeToMinutes(time: string): number {
  const parts = time.split(':');
  const h = parts[0] !== undefined ? Number(parts[0]) : 0;
  const m = parts[1] !== undefined ? Number(parts[1]) : 0;
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

type TimeBlockLayerProps = {
  hours?: DayTimeRange | null;
  color: string;
  hoverColor: string;
  offsetY: number;
  label: string;
  formatTime: (time: string) => string;
};

function TimeBlockLayer({
  hours,
  color,
  hoverColor,
  offsetY,
  label,
  formatTime,
}: TimeBlockLayerProps) {
  if (!hours?.enabled) return null;

  return (
    <>
      {hours.timeBlocks.map((block, idx) => {
        const startMin = timeToMinutes(block.startTime);
        const endMin = timeToMinutes(block.endTime);
        const left = (startMin / 1440) * 100;
        const width = ((endMin - startMin) / 1440) * 100;

        return (
          <Tooltip key={idx}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'absolute h-3 rounded-sm transition-colors',
                  color,
                  hoverColor
                )}
                style={{
                  left: `${left}%`,
                  width: `${Math.max(width, 0.5)}%`,
                  top: `${offsetY}px`,
                }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-medium">{label}:</span>{' '}
              {formatTime(block.startTime)} - {formatTime(block.endTime)}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}

type DayRowProps = {
  shortLabel: string;
  work?: DayTimeRange | null;
  meeting?: DayTimeRange | null;
  personal?: DayTimeRange | null;
  formatTime: (time: string) => string;
  noHoursLabel: string;
  typeLabels: [string, string, string];
};

function DayRow({
  shortLabel,
  work,
  meeting,
  personal,
  formatTime,
  noHoursLabel,
  typeLabels,
}: DayRowProps) {
  const anyEnabled = work?.enabled || meeting?.enabled || personal?.enabled;

  return (
    <div className={cn('flex items-center gap-3', !anyEnabled && 'opacity-40')}>
      <div className="w-12 shrink-0">
        <span className="font-medium text-sm">{shortLabel}</span>
      </div>
      <div className="relative h-12 flex-1 rounded-md bg-muted/20">
        {/* Grid lines for reference */}
        <div className="absolute inset-0 flex">
          <div className="w-1/4 border-muted/30 border-r" />
          <div className="w-1/4 border-muted/30 border-r" />
          <div className="w-1/4 border-muted/30 border-r" />
          <div className="w-1/4" />
        </div>

        {/* Stacked layers */}
        <TimeBlockLayer
          hours={work}
          color={HOUR_TYPE_CONFIG[0].bg}
          hoverColor={HOUR_TYPE_CONFIG[0].hoverBg}
          offsetY={4}
          label={typeLabels[0]}
          formatTime={formatTime}
        />
        <TimeBlockLayer
          hours={meeting}
          color={HOUR_TYPE_CONFIG[1].bg}
          hoverColor={HOUR_TYPE_CONFIG[1].hoverBg}
          offsetY={20}
          label={typeLabels[1]}
          formatTime={formatTime}
        />
        <TimeBlockLayer
          hours={personal}
          color={HOUR_TYPE_CONFIG[2].bg}
          hoverColor={HOUR_TYPE_CONFIG[2].hoverBg}
          offsetY={36}
          label={typeLabels[2]}
          formatTime={formatTime}
        />

        {/* Empty state indicator */}
        {!anyEnabled && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-muted-foreground text-xs">
              {noHoursLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function HoursOverview({
  workHours,
  meetingHours,
  personalHours,
}: HoursOverviewProps) {
  const t = useTranslations('calendar_settings');
  const format = useFormatter();
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    if (hours === undefined || minutes === undefined) return time;
    return format.dateTime(new Date(Date.UTC(2020, 0, 1, hours, minutes)), {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  };
  const typeLabels = HOUR_TYPE_CONFIG.map(({ translationKey }) =>
    t(`overview.types.${translationKey}`)
  ) as [string, string, string];

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        {HOUR_TYPE_CONFIG.map(({ key, bg, translationKey, icon: Icon }) => (
          <div key={key} className="flex items-center gap-2">
            <div className={cn('h-3 w-6 rounded-sm', bg)} />
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {t(`overview.types.${translationKey}`)}
            </span>
          </div>
        ))}
      </div>

      {/* Timeline container */}
      <div className="rounded-lg border p-4">
        {/* Hour markers */}
        <div className="mb-2 flex items-center gap-3">
          <div className="w-12 shrink-0" />
          <div className="flex flex-1 justify-between text-[10px] text-muted-foreground">
            <span>{formatTime('00:00')}</span>
            <span>{formatTime('06:00')}</span>
            <span>{formatTime('12:00')}</span>
            <span>{formatTime('18:00')}</span>
            <span>{formatTime('00:00')}</span>
          </div>
        </div>

        {/* Day rows */}
        <div className="space-y-2">
          {DAYS.map((day) => (
            <DayRow
              key={day}
              shortLabel={t(`days.${day}.short`)}
              work={workHours?.[day]}
              meeting={meetingHours?.[day]}
              personal={personalHours?.[day]}
              formatTime={formatTime}
              noHoursLabel={t('overview.no_hours_set')}
              typeLabels={typeLabels}
            />
          ))}
        </div>

        {/* Summary stats */}
        <div className="mt-4 flex flex-wrap gap-4 border-t pt-4">
          {HOUR_TYPE_CONFIG.map(({ key, translationKey, icon: Icon }) => {
            const hours =
              key === 'work'
                ? workHours
                : key === 'meeting'
                  ? meetingHours
                  : personalHours;
            const totalMinutes = calculateTotalMinutes(hours);
            const wholeHours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            const totalHours =
              minutes === 0
                ? t('overview.total_hours', { hours: wholeHours })
                : t('overview.total_hours_minutes', {
                    hours: wholeHours,
                    minutes,
                  });
            const activeDays = countActiveDays(hours);

            return (
              <div key={key} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  <span className="font-medium">
                    {t(`overview.types.${translationKey}`)}:
                  </span>{' '}
                  <span className="text-muted-foreground">
                    {t('overview.summary', {
                      count: activeDays,
                      total: totalHours,
                    })}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function calculateTotalMinutes(hours?: WeekTimeRanges | null): number {
  if (!hours) return 0;

  let totalMinutes = 0;
  Object.values(hours).forEach((day) => {
    if (day.enabled) {
      day.timeBlocks.forEach((block) => {
        const startMin = timeToMinutes(block.startTime);
        const endMin = timeToMinutes(block.endTime);
        totalMinutes += endMin - startMin;
      });
    }
  });

  return totalMinutes;
}

function countActiveDays(hours?: WeekTimeRanges | null): number {
  if (!hours) return 0;
  return Object.values(hours).filter((day) => day.enabled).length;
}
