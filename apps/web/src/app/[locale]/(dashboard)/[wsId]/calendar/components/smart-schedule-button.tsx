'use client';

import { Loader2, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

interface SmartScheduleButtonProps {
  wsId: string;
}

export function SmartScheduleButton({ wsId }: SmartScheduleButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { refresh } = useCalendarSync();

  const handleSmartSchedule = async () => {
    setIsLoading(true);
    toast.loading('Running smart schedule...', { id: 'smart-schedule' });

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/calendar/schedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ windowDays: 30, forceReschedule: true }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Scheduling failed');
      }

      // Refresh calendar to show new events
      refresh();

      toast.success(
        `Scheduled ${result.summary.eventsCreated} events (${result.summary.habitsScheduled} habits, ${result.summary.tasksScheduled} tasks)`,
        { id: 'smart-schedule' }
      );

      if (result.summary.bumpedHabits > 0) {
        toast.info(
          `${result.summary.bumpedHabits} habit events were rescheduled due to urgent tasks`
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Scheduling failed',
        { id: 'smart-schedule' }
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSmartSchedule}
      disabled={isLoading}
      variant="default"
      size="sm"
      className="gap-2"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {isLoading ? 'Scheduling...' : 'Smart Schedule'}
    </Button>
  );
}
