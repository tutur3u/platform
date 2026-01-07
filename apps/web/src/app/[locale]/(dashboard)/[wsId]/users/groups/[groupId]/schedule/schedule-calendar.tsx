'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  /** The starting date of the group - restricts calendar navigation before this date */
  startingDate?: string | null;
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
  startingDate,
  endingDate,
}: ScheduleCalendarProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const { data: fetchedSessions } = useQuery({
    queryKey: ['group-schedule', groupId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_user_groups')
        .select('sessions')
        .eq('ws_id', wsId)
        .eq('id', groupId)
        .single();

      if (error) throw error;
      return (data?.sessions as string[]) || [];
    },
    initialData: initialSessions,
  });

  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set());

  // Derive current sessions from fetched data + pending changes
  // pendingChanges contains dates that are DIFFERENT from fetchedSessions
  // (either added or removed)
  const currentSessions = useMemo(() => {
    const combined = new Set(fetchedSessions);
    pendingChanges.forEach((date) => {
      if (combined.has(date)) {
        combined.delete(date);
      } else {
        combined.add(date);
      }
    });
    return combined;
  }, [fetchedSessions, pendingChanges]);

  // Mutation for updating schedule
  const mutation = useMutation({
    mutationFn: async (newSessions: string[]) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('workspace_user_groups')
        .update({ sessions: newSessions })
        .eq('ws_id', wsId)
        .eq('id', groupId);

      if (error) throw error;
    },
    onSuccess: () => {
      setPendingChanges(new Set());
      queryClient.invalidateQueries({ queryKey: ['group-schedule', groupId] });
      toast.success(t('common.success'));
    },
    onError: (error) => {
      console.error('Error updating schedule:', error);
      toast.error(t('common.error'));
    },
  });

  // Handle date click - simply toggle the date in pendingChanges
  const handleDateClick = useCallback(
    (date: Date) => {
      if (!canUpdateSchedule) return;

      const dateStr = dayjs(date).format('YYYY-MM-DD');

      setPendingChanges((prev) => {
        const newPending = new Set(prev);
        if (newPending.has(dateStr)) {
          newPending.delete(dateStr);
        } else {
          newPending.add(dateStr);
        }
        return newPending;
      });
    },
    [canUpdateSchedule]
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
      const allSelected = dateStrings.every((dateStr) =>
        currentSessions.has(dateStr)
      );

      // Update pending changes
      setPendingChanges((prev) => {
        const newPending = new Set(prev);
        dateStrings.forEach((dateStr) => {
          const isCurrentlySelected = currentSessions.has(dateStr);

          if (allSelected) {
            // We want to deselect everything
            // If it's currently selected, we need to toggle it
            if (isCurrentlySelected) {
              if (newPending.has(dateStr)) {
                newPending.delete(dateStr);
              } else {
                newPending.add(dateStr);
              }
            }
          } else {
            // We want to select everything
            // If it's NOT currently selected, we need to toggle it
            if (!isCurrentlySelected) {
              if (newPending.has(dateStr)) {
                newPending.delete(dateStr);
              } else {
                newPending.add(dateStr);
              }
            }
          }
        });
        return newPending;
      });
    },
    [currentSessions, canUpdateSchedule]
  );

  // Reset changes
  const handleReset = useCallback(() => {
    setPendingChanges(new Set());
  }, []);

  // Submit changes
  const handleSubmit = useCallback(() => {
    if (pendingChanges.size === 0) {
      toast.info(t('common.no_changes_to_save'));
      return;
    }
    mutation.mutate(Array.from(currentSessions));
  }, [mutation, currentSessions, pendingChanges.size, t]);

  // Convert sessions to attendance data format
  const attendanceData = useMemo(
    () =>
      Array.from(currentSessions).map((dateStr) => ({
        date: dateStr,
        status: 'PRESENT' as const,
        groups: [
          {
            id: dateStr,
            name: dayjs(dateStr).locale(locale).format('D MMMM YYYY'),
          },
        ],
      })),
    [currentSessions, locale]
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
              disabled={mutation.isPending}
            >
              <RotateCcw className="h-4 w-4" />
              {t('common.reset')}
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className={cn(
                'border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
              )}
            >
              <Save className="h-4 w-4" />
              {mutation.isPending ? t('common.saving') : t('common.save')}
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
        minDate={startingDate ? new Date(startingDate) : undefined}
        maxDate={endingDate ? new Date(endingDate) : undefined}
      />
    </div>
  );
}
