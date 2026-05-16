'use client';

import { useMutation } from '@tanstack/react-query';
import { CalendarDays, WandSparkles } from '@tuturuuu/icons';
import {
  updateWorkspaceCourse,
  type WorkspaceCourseListItem,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  generateWeeklySessions,
  inferWeekdaysFromSessions,
  todayIsoDate,
} from './attendance-utils';

export function AttendanceSchedulePanel({
  course,
  onSaved,
  wsId,
}: {
  course: WorkspaceCourseListItem;
  onSaved: () => void;
  wsId: string;
}) {
  const locale = useLocale();
  const t = useTranslations('teachOperations');
  const inferredWeekdays = useMemo(
    () => inferWeekdaysFromSessions(course.sessions),
    [course.sessions]
  );
  const [startingDate, setStartingDate] = useState(
    course.starting_date ?? todayIsoDate()
  );
  const [endingDate, setEndingDate] = useState(
    course.ending_date ?? course.starting_date ?? todayIsoDate()
  );
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(
    inferredWeekdays.size ? Array.from(inferredWeekdays) : [0, 2, 4]
  );

  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => ({
        index,
        label: new Date(2026, 0, 5 + index).toLocaleDateString(locale, {
          weekday: 'short',
        }),
      })),
    [locale]
  );

  const generatedSessions = useMemo(() => {
    if (!startingDate || !endingDate || selectedWeekdays.length === 0) {
      return [];
    }
    if (endingDate < startingDate) return [];

    return generateWeeklySessions({
      endingDate,
      selectedWeekdays: new Set(selectedWeekdays),
      startingDate,
    });
  }, [endingDate, selectedWeekdays, startingDate]);

  const saveSchedule = useMutation({
    mutationFn: () =>
      updateWorkspaceCourse(wsId, course.id, {
        ending_date: endingDate,
        sessions: generatedSessions,
        starting_date: startingDate,
      }),
    onError: () => {
      toast.error(t('scheduleSaveError'));
    },
    onSuccess: () => {
      toast.success(t('scheduleSaved'));
      onSaved();
    },
  });

  const toggleWeekday = (weekday: number) => {
    setSelectedWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((entry) => entry !== weekday)
        : [...current, weekday].sort((a, b) => a - b)
    );
  };

  return (
    <section className="space-y-4 border-2 border-border bg-background p-4 shadow-[4px_4px_0_var(--border)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-dynamic-blue/10">
          <CalendarDays className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-black text-lg">{t('scheduleTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('scheduleLead')}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-bold">{t('startDate')}</span>
          <input
            className="h-10 border-2 border-border bg-card px-3 font-bold outline-none focus:border-primary"
            onChange={(event) => setStartingDate(event.target.value)}
            type="date"
            value={startingDate}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-bold">{t('endDate')}</span>
          <input
            className="h-10 border-2 border-border bg-card px-3 font-bold outline-none focus:border-primary"
            min={startingDate}
            onChange={(event) => setEndingDate(event.target.value)}
            type="date"
            value={endingDate}
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="font-bold text-sm">{t('classDays')}</p>
        <div className="grid grid-cols-7 gap-1">
          {weekdays.map((weekday) => {
            const selected = selectedWeekdays.includes(weekday.index);
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  'h-10 border-2 border-border bg-card font-black text-xs',
                  selected &&
                    'border-dynamic-blue/50 bg-dynamic-blue/15 text-dynamic-blue'
                )}
                key={weekday.index}
                onClick={() => toggleWeekday(weekday.index)}
                type="button"
              >
                {weekday.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-2 border-border border-dashed bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-black">{t('generatedSessions')}</p>
          <p className="text-muted-foreground text-sm">
            {t('generatedSessionsDescription', {
              count: generatedSessions.length,
            })}
          </p>
        </div>
        <Button
          disabled={
            saveSchedule.isPending ||
            !generatedSessions.length ||
            endingDate < startingDate
          }
          onClick={() => saveSchedule.mutate()}
        >
          <WandSparkles className="h-4 w-4" />
          {saveSchedule.isPending ? t('saving') : t('saveSchedule')}
        </Button>
      </div>
    </section>
  );
}
