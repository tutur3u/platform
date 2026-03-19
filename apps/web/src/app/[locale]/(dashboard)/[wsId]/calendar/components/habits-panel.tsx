'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flame, Pencil, RefreshCw, Repeat } from '@tuturuuu/icons';
import type { Habit, HabitStreak } from '@tuturuuu/types/primitives/Habit';
import { getRecurrenceDescription } from '@tuturuuu/types/primitives/Habit';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import HabitFormDialog from '@tuturuuu/ui/tu-do/habits/habit-form-dialog';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

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

export function HabitsPanel({ wsId }: HabitsPanelProps) {
  const [isHabitDialogOpen, setIsHabitDialogOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const queryClient = useQueryClient();

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
      <div className="flex flex-col gap-1.5">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
        <p className="text-muted-foreground/60 text-xs">
          Failed to load habits
        </p>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-1.5 h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  if (habits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-4 text-center">
        <Repeat className="h-5 w-5 text-muted-foreground/40" />
        <p className="text-[11px] text-muted-foreground/50">No active habits</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {habits.map((habit) => {
        const colorClass = colorMap[habit.color] || colorMap.BLUE;
        const isVisible = habit.is_visible_in_calendar ?? true;

        return (
          <div
            key={habit.id}
            className={cn(
              'group/habit rounded-md border border-border/40 bg-background/50 p-2 transition-colors hover:border-border/60 hover:bg-background/80',
              !isVisible && 'opacity-50'
            )}
          >
            <div className="flex items-center gap-2">
              {/* Color dot */}
              <div
                className={cn('h-2 w-2 shrink-0 rounded-full', colorClass)}
              />
              {/* Name + recurrence */}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-xs">{habit.name}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                  <span>{getRecurrenceDescription(habit)}</span>
                  <span>·</span>
                  <span>{habit.duration_minutes}m</span>
                  {habit.streak && habit.streak.current_streak > 0 && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-0.5 text-dynamic-orange">
                        <Flame className="h-2.5 w-2.5" />
                        {habit.streak.current_streak}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {/* Actions */}
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 transition-opacity group-hover/habit:opacity-100"
                  onClick={() => handleEditHabit(habit)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Switch
                  checked={isVisible}
                  onCheckedChange={() => toggleVisibility(habit.id, isVisible)}
                  className="scale-75"
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Habit Edit Dialog */}
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
