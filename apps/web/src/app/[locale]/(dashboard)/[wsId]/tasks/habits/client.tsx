'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Flame, Plus, RefreshCw, Repeat } from '@tuturuuu/icons';
import type { Habit, HabitStreak } from '@tuturuuu/types/primitives/Habit';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import HabitCard from './habit-card';
import HabitFormDialog from './habit-form-dialog';

interface HabitsClientPageProps {
  wsId: string;
}

interface HabitWithStreak extends Habit {
  streak?: HabitStreak;
}

export default function HabitsClientPage({ wsId }: HabitsClientPageProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
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

  const habits: HabitWithStreak[] = habitsData?.habits || [];

  const handleCreateSuccess = () => {
    setIsCreateDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['habits', wsId] });
    toast.success('Habit created successfully');
  };

  const handleEditSuccess = () => {
    setEditingHabit(null);
    queryClient.invalidateQueries({ queryKey: ['habits', wsId] });
    toast.success('Habit updated successfully');
  };

  const handleDelete = async (habitId: string) => {
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/habits/${habitId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete habit');
      }

      queryClient.invalidateQueries({ queryKey: ['habits', wsId] });
      toast.success('Habit deleted');
    } catch {
      toast.error('Failed to delete habit');
    }
  };

  // Note: Manual scheduling removed - handled by Smart Schedule button in Calendar

  const handleComplete = async (habitId: string, date: string) => {
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/habits/${habitId}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ occurrence_date: date, completed: true }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to complete habit');
      }

      queryClient.invalidateQueries({ queryKey: ['habits', wsId] });
      toast.success('Habit completed!');
    } catch {
      toast.error('Failed to complete habit');
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl tracking-tight">Habits</h1>
          <p className="text-muted-foreground">
            Track your recurring habits and build streaks
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Habit
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      {!isLoading && habits.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Habits</CardDescription>
              <CardTitle className="text-3xl">{habits.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-3xl">
                {habits.filter((h) => h.is_active).length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Best Streak</CardDescription>
              <CardTitle className="flex items-center gap-2 text-3xl">
                <Flame className="h-6 w-6 text-orange-500" />
                {Math.max(...habits.map((h) => h.streak?.best_streak ?? 0), 0)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg. Completion Rate</CardDescription>
              <CardTitle className="text-3xl">
                {habits.length > 0
                  ? Math.round(
                      habits.reduce(
                        (sum, h) => sum + (h.streak?.completion_rate ?? 0),
                        0
                      ) / habits.length
                    )
                  : 0}
                %
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Habits List */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              Failed to load habits. Please try again.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : habits.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Repeat className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-semibold text-lg">No habits yet</h3>
            <p className="mt-2 text-muted-foreground">
              Create your first habit to start tracking your progress
            </p>
            <Button
              className="mt-4"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Habit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              wsId={wsId}
              onEdit={() => setEditingHabit(habit)}
              onDelete={() => handleDelete(habit.id)}
              onComplete={(date) => handleComplete(habit.id, date)}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <HabitFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        wsId={wsId}
        onSuccess={handleCreateSuccess}
      />

      {/* Edit Dialog */}
      {editingHabit && (
        <HabitFormDialog
          open={!!editingHabit}
          onOpenChange={(open) => !open && setEditingHabit(null)}
          wsId={wsId}
          habit={editingHabit}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
