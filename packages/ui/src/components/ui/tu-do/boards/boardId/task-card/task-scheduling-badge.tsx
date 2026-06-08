import type { CalendarHoursType } from '@tuturuuu/types/primitives/Task';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import type { ReactElement, SVGProps } from 'react';
import {
  formatTaskDurationLabel,
  formatTaskSchedulingBadgeTitle,
  type TaskSchedulingBadgeTitleLabels,
} from '../menus/task-scheduling-utils';

function WorkScheduleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16" {...props}>
      <path
        d="M5.75 4.25V3.5A1.5 1.5 0 0 1 7.25 2h1.5a1.5 1.5 0 0 1 1.5 1.5v.75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M3.5 4.5h9A1.5 1.5 0 0 1 14 6v5.25A1.75 1.75 0 0 1 12.25 13h-8.5A1.75 1.75 0 0 1 2 11.25V6a1.5 1.5 0 0 1 1.5-1.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M2.25 7.5h11.5M7 7.5v1h2v-1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function PersonalScheduleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16" {...props}>
      <path
        d="M2.75 7.25 8 3l5.25 4.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M4.25 6.75v5A1.25 1.25 0 0 0 5.5 13h5a1.25 1.25 0 0 0 1.25-1.25v-5"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M6.5 13V9.75h3V13"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function MeetingScheduleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16" {...props}>
      <path
        d="M5.25 7a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM10.75 7a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M2.75 12.5v-.75A2.75 2.75 0 0 1 5.5 9h.25M13.25 12.5v-.75A2.75 2.75 0 0 0 10.5 9h-.25M6.75 10.5h2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function AutoScheduleMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 10 10" {...props}>
      <path
        d="M5.75 1.25 2.5 5.4h2.35l-.6 3.35L7.5 4.6H5.15l.6-3.35Z"
        fill="currentColor"
      />
    </svg>
  );
}

const SCHEDULE_BADGE_CONFIG = {
  meeting_hours: {
    className:
      'border-dynamic-orange/35 bg-dynamic-orange/10 text-dynamic-orange',
    Icon: MeetingScheduleIcon,
  },
  personal_hours: {
    className: 'border-dynamic-green/35 bg-dynamic-green/10 text-dynamic-green',
    Icon: PersonalScheduleIcon,
  },
  work_hours: {
    className: 'border-dynamic-blue/35 bg-dynamic-blue/10 text-dynamic-blue',
    Icon: WorkScheduleIcon,
  },
} satisfies Record<
  CalendarHoursType,
  {
    className: string;
    Icon: (props: SVGProps<SVGSVGElement>) => ReactElement;
  }
>;

function getScheduleBadgeConfig(calendarHours: CalendarHoursType | null) {
  return calendarHours
    ? SCHEDULE_BADGE_CONFIG[calendarHours]
    : {
        className:
          'border-dynamic-gray/30 bg-dynamic-gray/10 text-dynamic-gray',
        Icon: WorkScheduleIcon,
      };
}

export function TaskSchedulingBadge({
  autoSchedule,
  calendarHours,
  isSplittable,
  labels,
  maxSplitDurationMinutes,
  minSplitDurationMinutes,
  onElement,
  totalDuration,
}: {
  autoSchedule?: boolean | null;
  calendarHours?: CalendarHoursType | null;
  isSplittable?: boolean | null;
  labels: TaskSchedulingBadgeTitleLabels;
  maxSplitDurationMinutes?: number | null;
  minSplitDurationMinutes?: number | null;
  onElement?: (element: HTMLElement | null) => void;
  totalDuration?: number | null;
}) {
  const durationLabel = formatTaskDurationLabel(totalDuration ?? null);
  if (!durationLabel) return null;

  const scheduleBadgeConfig = getScheduleBadgeConfig(calendarHours ?? null);
  const ScheduleIcon = scheduleBadgeConfig.Icon;
  const schedulingTitle = formatTaskSchedulingBadgeTitle({
    autoSchedule,
    calendarHours,
    durationLabel,
    isSplittable,
    labels,
    maxSplitDurationMinutes,
    minSplitDurationMinutes,
  });

  return (
    <Badge
      variant="secondary"
      className={cn(
        'h-5 shrink-0 border px-1.5 font-medium text-[10px]',
        scheduleBadgeConfig.className
      )}
      title={schedulingTitle}
      ref={(element) => onElement?.(element as HTMLElement | null)}
    >
      <ScheduleIcon className="h-2.5 w-2.5" />
      {durationLabel}
      {autoSchedule && (
        <AutoScheduleMark className="-mr-0.5 h-2.5 w-2.5 opacity-80" />
      )}
    </Badge>
  );
}
