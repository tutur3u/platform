'use client';

import type { TopicScheduleClass } from '@tuturuuu/internal-api/topic-announcements';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';

/**
 * The GVCN (homeroom teacher) is assigned automatically from the class's
 * TEACHER members and is read-only here. With several teachers the earliest
 * assigned is used; the others are listed on hover.
 */
export function ScheduleGvcnCell({
  scheduleClass,
  teacherId,
}: {
  scheduleClass: TopicScheduleClass | undefined;
  teacherId: string | null;
}) {
  const t = useTranslations('ws-topic-announcements');
  if (!scheduleClass) {
    return <span className="text-muted-foreground text-sm">--</span>;
  }

  const teacher = scheduleClass.teachers.find((item) => item.id === teacherId);
  if (!teacher) {
    return (
      <span className="text-dynamic-orange text-sm">
        {t('schedule_needs_gvcn')}
      </span>
    );
  }

  const others = scheduleClass.teachers.filter(
    (item) => item.id !== teacher.id
  );
  return (
    <span className="flex min-w-0 items-center gap-1 text-sm">
      <span className="truncate" title={teacher.name}>
        {teacher.name || t('schedule_unnamed_teacher')}
      </span>
      {others.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0 rounded bg-muted px-1 text-muted-foreground text-xs">
              +{others.length}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {t('schedule_other_teachers', {
              names: others.map((item) => item.name).join(', '),
            })}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}
