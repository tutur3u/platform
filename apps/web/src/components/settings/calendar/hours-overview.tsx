'use client';

import { Briefcase, Calendar, User } from '@tuturuuu/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import type { DayTimeRange, WeekTimeRanges } from './time-range-picker';

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
    label: 'Work',
    icon: Briefcase,
  },
  {
    key: 'meeting',
    bg: 'bg-dynamic-cyan/70',
    hoverBg: 'hover:bg-dynamic-cyan',
    label: 'Meeting',
    icon: Calendar,
  },
  {
    key: 'personal',
    bg: 'bg-dynamic-green/70',
    hoverBg: 'hover:bg-dynamic-green',
    label: 'Personal',
    icon: User,
  },
] as const;

const DAYS: Array<{ key: keyof WeekTimeRanges; label: string; short: string }> =
  [
    { key: 'monday', label: 'Monday', short: 'Mon' },
    { key: 'tuesday', label: 'Tuesday', short: 'Tue' },
    { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
    { key: 'thursday', label: 'Thursday', short: 'Thu' },
    { key: 'friday', label: 'Friday', short: 'Fri' },
    { key: 'saturday', label: 'Saturday', short: 'Sat' },
    { key: 'sunday', label: 'Sunday', short: 'Sun' },
  ];

function timeToMinutes(time: string): number {
  const parts = time.split(':');
  const h = parts[0] !== undefined ? Number(parts[0]) : 0;
  const m = parts[1] !== undefined ? Number(parts[1]) : 0;
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (h === undefined || m === undefined) return time;
  const hour = h % 12 || 12;
  const ampm = h < 12 ? 'am' : 'pm';
  return m === 0
    ? `${hour}${ampm}`
    : `${hour}:${m.toString().padStart(2, '0')}${ampm}`;
}

type TimeBlockLayerProps = {
  hours?: DayTimeRange | null;
  color: string;
  hoverColor: string;
  offsetY: number;
  label: string;
};

function TimeBlockLayer({
  hours,
  color,
  hoverColor,
  offsetY,
  label,
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
  day: { key: keyof WeekTimeRanges; label: string; short: string };
  work?: DayTimeRange | null;
  meeting?: DayTimeRange | null;
  personal?: DayTimeRange | null;
};

function DayRow({ day, work, meeting, personal }: DayRowProps) {
  const anyEnabled = work?.enabled || meeting?.enabled || personal?.enabled;

  return (
    <div className={cn('flex items-center gap-3', !anyEnabled && 'opacity-40')}>
      <div className="w-12 shrink-0">
        <span className="font-medium text-sm">{day.short}</span>
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
          label={HOUR_TYPE_CONFIG[0].label}
        />
        <TimeBlockLayer
          hours={meeting}
          color={HOUR_TYPE_CONFIG[1].bg}
          hoverColor={HOUR_TYPE_CONFIG[1].hoverBg}
          offsetY={20}
          label={HOUR_TYPE_CONFIG[1].label}
        />
        <TimeBlockLayer
          hours={personal}
          color={HOUR_TYPE_CONFIG[2].bg}
          hoverColor={HOUR_TYPE_CONFIG[2].hoverBg}
          offsetY={36}
          label={HOUR_TYPE_CONFIG[2].label}
        />

        {/* Empty state indicator */}
        {!anyEnabled && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-muted-foreground text-xs">No hours set</span>
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
  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        {HOUR_TYPE_CONFIG.map(({ key, bg, label, icon: Icon }) => (
          <div key={key} className="flex items-center gap-2">
            <div className={cn('h-3 w-6 rounded-sm', bg)} />
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{label}</span>
          </div>
        ))}
      </div>

      {/* Timeline container */}
      <div className="rounded-lg border p-4">
        {/* Hour markers */}
        <div className="mb-2 flex items-center gap-3">
          <div className="w-12 shrink-0" />
          <div className="flex flex-1 justify-between text-[10px] text-muted-foreground">
            <span>12am</span>
            <span>6am</span>
            <span>12pm</span>
            <span>6pm</span>
            <span>12am</span>
          </div>
        </div>

        {/* Day rows */}
        <div className="space-y-2">
          {DAYS.map((day) => (
            <DayRow
              key={day.key}
              day={day}
              work={workHours?.[day.key]}
              meeting={meetingHours?.[day.key]}
              personal={personalHours?.[day.key]}
            />
          ))}
        </div>

        {/* Summary stats */}
        <div className="mt-4 flex flex-wrap gap-4 border-t pt-4">
          {HOUR_TYPE_CONFIG.map(({ key, label, icon: Icon }) => {
            const hours =
              key === 'work'
                ? workHours
                : key === 'meeting'
                  ? meetingHours
                  : personalHours;
            const totalHours = calculateTotalHours(hours);
            const activeDays = countActiveDays(hours);

            return (
              <div key={key} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  <span className="font-medium">{label}:</span>{' '}
                  <span className="text-muted-foreground">
                    {totalHours} ({activeDays} days)
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

function calculateTotalHours(hours?: WeekTimeRanges | null): string {
  if (!hours) return '0h';

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

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h}h/wk`;
  return `${h}h ${m}m/wk`;
}

function countActiveDays(hours?: WeekTimeRanges | null): number {
  if (!hours) return 0;
  return Object.values(hours).filter((day) => day.enabled).length;
}
