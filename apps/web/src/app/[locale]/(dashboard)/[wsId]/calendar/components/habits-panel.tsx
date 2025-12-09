'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Check,
  Clock,
  Flame,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Repeat,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Habit, HabitStreak } from '@tuturuuu/types/primitives/Habit';
import { getRecurrenceDescription } from '@tuturuuu/types/primitives/Habit';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import Link from 'next/link';
import { useState } from 'react';
import { scheduleHabit } from '@/lib/calendar/habit-scheduler';
import HabitFormDialog from '../../tasks/habits/habit-form-dialog';

interface HabitWithStreak extends Habit {
  streak?: HabitStreak;
}

interface HabitsPanelProps {
  wsId: string;
  onEventCreated?: () => void;
}

const colorMap: Record<string, string> = {
  BLUE: 'bg-dynamic-blue',
  RED: 'bg-dynamic-red',
  GREEN: 'bg-dynamic-green',
  YELLOW: 'bg-dynamic-yellow',
  PURPLE: 'bg-dynamic-purple',
  PINK: 'bg-dynamic-pink',
  CYAN: 'bg-dynamic-cyan',
  ORANGE: 'bg-dynamic-orange',
};

const priorityColors: Record<string, string> = {
  critical: 'text-dynamic-red',
  high: 'text-dynamic-orange',
  normal: 'text-dynamic-blue',
  low: 'text-muted-foreground',
};

export function HabitsPanel({ wsId, onEventCreated }: HabitsPanelProps) {
  const [schedulingHabitId, setSchedulingHabitId] = useState<string | null>(
    null
  );
  const [completingHabitId, setCompletingHabitId] = useState<string | null>(
    null
  );
  const [isHabitDialogOpen, setIsHabitDialogOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Fetch habits with React Query
  const {
    data: habitsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['habits', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/habits`);
      if (!response.ok) {
        throw new Error('Failed to fetch habits');
      }
      return response.json();
    },
  });

  const habits: HabitWithStreak[] = (habitsData?.habits || []).filter(
    (h: HabitWithStreak) => h.is_active
  );

  // Mutation to update habit visibility
  const visibilityMutation = useMutation({
    mutationFn: async ({
      habitId,
      isVisible,
    }: {
      habitId: string;
      isVisible: boolean;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/habits/${habitId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_visible_in_calendar: isVisible }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to update habit visibility');
      }
      return response.json();
    },
    onMutate: async ({ habitId, isVisible }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['habits', wsId] });

      // Snapshot the previous value
      const previousHabits = queryClient.getQueryData(['habits', wsId]);

      // Optimistically update to the new value
      queryClient.setQueryData(
        ['habits', wsId],
        (old: { habits: HabitWithStreak[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            habits: old.habits.map((h) =>
              h.id === habitId ? { ...h, is_visible_in_calendar: isVisible } : h
            ),
          };
        }
      );

      return { previousHabits };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousHabits) {
        queryClient.setQueryData(['habits', wsId], context.previousHabits);
      }
      toast.error('Failed to update visibility');
    },
  });

  const toggleVisibility = (habitId: string, currentVisibility: boolean) => {
    visibilityMutation.mutate({
      habitId,
      isVisible: !currentVisibility,
    });
  };

  const handleSchedule = async (habit: Habit) => {
    setSchedulingHabitId(habit.id);
    try {
      const result = await scheduleHabit(supabase, wsId, habit, 30);

      if (result.eventsCreated > 0) {
        toast.success(`Scheduled ${result.eventsCreated} occurrence(s)`);
        queryClient.invalidateQueries({ queryKey: ['calendarEvents', wsId] });
        onEventCreated?.();
      } else {
        toast.info('No new events to schedule');
      }
    } catch {
      toast.error('Failed to schedule habit');
    } finally {
      setSchedulingHabitId(null);
    }
  };

  const handleComplete = async (habitId: string) => {
    setCompletingHabitId(habitId);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/habits/${habitId}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ occurrence_date: today, completed: true }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to complete habit');
      }

      queryClient.invalidateQueries({ queryKey: ['habits', wsId] });
      toast.success('Habit completed!');
    } catch {
      toast.error('Failed to complete habit');
    } finally {
      setCompletingHabitId(null);
    }
  };

  const handleEditHabit = (habit: Habit) => {
    setEditingHabit(habit);
    setIsHabitDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setEditingHabit(null);
    }
    setIsHabitDialogOpen(open);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-muted-foreground text-sm">Failed to load habits</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (habits.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <Repeat className="h-12 w-12 text-muted-foreground" />
          <div>
            <h4 className="font-medium">No active habits</h4>
            <p className="text-muted-foreground text-sm">
              Create habits to track recurring activities
            </p>
          </div>
          <Button size="sm" onClick={() => setIsHabitDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Create Habit
          </Button>
        </div>
        <HabitFormDialog
          open={isHabitDialogOpen}
          onOpenChange={handleDialogClose}
          wsId={wsId}
          habit={editingHabit ?? undefined}
          onSuccess={() => {
            setIsHabitDialogOpen(false);
            setEditingHabit(null);
            refetch();
          }}
        />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4" />
          <span className="font-medium text-sm">
            {habits.length} active habit{habits.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsHabitDialogOpen(true)}
            title="Create new habit"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Habits List */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-3">
          {habits.map((habit) => {
            const colorClass = colorMap[habit.color] || colorMap.BLUE;
            const isVisible = habit.is_visible_in_calendar ?? true;
            const isScheduling = schedulingHabitId === habit.id;
            const isCompleting = completingHabitId === habit.id;

            return (
              <Card
                key={habit.id}
                className={cn(
                  'relative overflow-hidden transition-all',
                  !isVisible && 'opacity-60'
                )}
              >
                <div
                  className={cn('absolute top-0 left-0 h-full w-1', colorClass)}
                />
                <CardContent className="p-3 pl-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-medium">{habit.name}</h4>
                      <p className="flex items-center gap-1 text-muted-foreground text-xs">
                        <Calendar className="h-3 w-3" />
                        {getRecurrenceDescription(habit)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEditHabit(habit)}
                        title="Edit habit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Switch
                        checked={isVisible}
                        onCheckedChange={() =>
                          toggleVisibility(habit.id, isVisible)
                        }
                      />
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Clock className="h-3 w-3" />
                      {habit.duration_minutes}m
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', priorityColors[habit.priority])}
                    >
                      {habit.priority}
                    </Badge>
                    {habit.streak && habit.streak.current_streak > 0 && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Flame className="h-3 w-3 text-dynamic-orange" />
                        {habit.streak.current_streak}
                      </Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-2 flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 flex-1 text-xs"
                      onClick={() => handleSchedule(habit)}
                      disabled={isScheduling}
                    >
                      {isScheduling ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="mr-1 h-3 w-3" />
                      )}
                      Schedule
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 flex-1 text-xs"
                      onClick={() => handleComplete(habit.id)}
                      disabled={isCompleting}
                    >
                      {isCompleting ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="mr-1 h-3 w-3" />
                      )}
                      Complete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-3">
        <Link href={`/${wsId}/tasks/habits`}>
          <Button variant="outline" size="sm" className="w-full">
            Manage Habits
          </Button>
        </Link>
      </div>

      {/* Habit Creation/Edit Dialog */}
      <HabitFormDialog
        open={isHabitDialogOpen}
        onOpenChange={handleDialogClose}
        wsId={wsId}
        habit={editingHabit ?? undefined}
        onSuccess={() => {
          setIsHabitDialogOpen(false);
          setEditingHabit(null);
          refetch();
        }}
      />
    </div>
  );
}
