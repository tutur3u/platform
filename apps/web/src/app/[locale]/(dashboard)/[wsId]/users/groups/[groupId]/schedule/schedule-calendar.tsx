'use client';

import { RotateCcw, Save } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { YearCalendar } from '@tuturuuu/ui/custom/calendar/year-calendar';
import { toast } from '@tuturuuu/ui/sonner';
import { StickyBottomBar } from '@tuturuuu/ui/sticky-bottom-bar';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

interface ScheduleCalendarProps {
  locale: string;
  wsId: string;
  groupId: string;
  initialSessions: string[];
  /** When true, hides days from previous and next months to reduce visual clutter */
  hideOutsideMonthDays?: boolean;
  canUpdateSchedule?: boolean;
  /** The ending date of the group - restricts calendar navigation beyond this date */
  endingDate?: string | null;
}

export default function ScheduleCalendar({
  locale,
  wsId,
  groupId,
  initialSessions,
  hideOutsideMonthDays = true,
  canUpdateSchedule = false,
  endingDate,
}: ScheduleCalendarProps) {
  const t = useTranslations();
  const [sessions, setSessions] = useState<Set<string>>(
    new Set(initialSessions)
  );
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if a date is in the original sessions
  const isOriginalSession = useCallback(
    (date: string) => initialSessions.includes(date),
    [initialSessions]
  );

  // Handle date click - add or remove from sessions
  const handleDateClick = useCallback(
    (date: Date) => {
      if (!canUpdateSchedule) return;

      const dateStr = dayjs(date).format('YYYY-MM-DD');

      setSessions((prev) => {
        const newSessions = new Set(prev);
        if (newSessions.has(dateStr)) {
          newSessions.delete(dateStr);
        } else {
          newSessions.add(dateStr);
        }
        return newSessions;
      });

      setPendingChanges((prev) => {
        const newPending = new Set(prev);
        if (isOriginalSession(dateStr)) {
          // If it was originally a session, toggling it creates a pending change
          if (sessions.has(dateStr)) {
            // Currently has it, will remove it -> pending removal
            newPending.add(dateStr);
          } else {
            // Currently doesn't have it, will add it back -> no pending change
            newPending.delete(dateStr);
          }
        } else {
          // If it wasn't originally a session, toggling it creates a pending change
          if (sessions.has(dateStr)) {
            // Currently has it, will remove it -> no pending change
            newPending.delete(dateStr);
          } else {
            // Currently doesn't have it, will add it -> pending addition
            newPending.add(dateStr);
          }
        }
        return newPending;
      });
    },
    [sessions, isOriginalSession, canUpdateSchedule]
  );

  // Handle day header click - select/deselect all dates in that column for the month
  const handleDayHeaderClick = useCallback(
    (dayIndex: number, monthDate: Date) => {
      if (!canUpdateSchedule) return;

      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();

      // Get all dates in the month for this day of week
      const datesInColumn: Date[] = [];
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      // Find the first occurrence of this day in the month
      const currentDate = new Date(firstDay);
      const targetDayOfWeek = dayIndex === 6 ? 0 : dayIndex + 1; // Convert to JS day index (Sunday = 0)

      while (currentDate.getDay() !== targetDayOfWeek) {
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Collect all dates for this day of week in the month
      while (currentDate <= lastDay) {
        if (currentDate.getMonth() === month) {
          datesInColumn.push(new Date(currentDate));
        }
        currentDate.setDate(currentDate.getDate() + 7);
      }

      // Check if all dates in this column are selected
      const dateStrings = datesInColumn.map((d) =>
        dayjs(d).format('YYYY-MM-DD')
      );
      const allSelected = dateStrings.every((dateStr) => sessions.has(dateStr));

      // Toggle all dates in the column
      setSessions((prev) => {
        const newSessions = new Set(prev);
        dateStrings.forEach((dateStr) => {
          if (allSelected) {
            newSessions.delete(dateStr);
          } else {
            newSessions.add(dateStr);
          }
        });
        return newSessions;
      });

      // Update pending changes
      setPendingChanges((prev) => {
        const newPending = new Set(prev);
        dateStrings.forEach((dateStr) => {
          if (isOriginalSession(dateStr)) {
            if (allSelected) {
              // Will remove it -> pending removal
              newPending.add(dateStr);
            } else {
              // Will add it back -> no pending change
              newPending.delete(dateStr);
            }
          } else {
            if (allSelected) {
              // Will remove it -> no pending change
              newPending.delete(dateStr);
            } else {
              // Will add it -> pending addition
              newPending.add(dateStr);
            }
          }
        });
        return newPending;
      });
    },
    [sessions, isOriginalSession, canUpdateSchedule]
  );

  // Reset changes
  const handleReset = useCallback(() => {
    setSessions(new Set(initialSessions));
    setPendingChanges(new Set());
  }, [initialSessions]);

  // Submit changes
  const handleSubmit = useCallback(async () => {
    if (pendingChanges.size === 0) {
      toast.info(t('common.no_changes_to_save'));
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();

      // Update the sessions array in the database
      const { error } = await supabase
        .from('workspace_user_groups')
        .update({ sessions: Array.from(sessions) })
        .eq('ws_id', wsId)
        .eq('id', groupId);

      if (error) throw error;

      setPendingChanges(new Set());
      toast.success(t('common.success'));
    } catch (error) {
      console.error('Error updating schedule:', error);
      toast.error(t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  }, [sessions, pendingChanges, wsId, groupId, t]);

  // Convert sessions to attendance data format
  const attendanceData = useMemo(
    () =>
      Array.from(sessions).map((dateStr) => ({
        date: dateStr,
        status: 'PRESENT' as const,
        groups: [
          {
            id: dateStr,
            name: dayjs(dateStr).locale(locale).format('D MMMM YYYY'),
          },
        ],
      })),
    [sessions, locale]
  );

  const hasChanges = pendingChanges.size > 0;

  return (
    <div>
      <StickyBottomBar
        show={hasChanges}
        message={t('common.unsaved-changes')}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={isSubmitting}
            >
              <RotateCcw className="h-4 w-4" />
              {t('common.reset')}
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={cn(
                'border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
              )}
            >
              <Save className="h-4 w-4" />
              {isSubmitting ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      />

      <YearCalendar
        locale={locale}
        attendanceData={attendanceData}
        onDateClick={handleDateClick}
        onDayHeaderClick={handleDayHeaderClick}
        hideOutsideMonthDays={hideOutsideMonthDays}
        maxDate={endingDate ? new Date(endingDate) : undefined}
      />
    </div>
  );
}
