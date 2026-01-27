'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  Edit,
  Goal,
  MoreHorizontal,
  Plus,
  Trash2,
} from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useWorkspaceCategories } from '@/hooks/use-workspace-categories';

// Goal tracking interface
export interface TimeTrackingGoal {
  id: string;
  ws_id: string;
  user_id: string;
  category_id: string | null;
  daily_goal_minutes: number;
  weekly_goal_minutes: number | null;
  is_active: boolean | null;
  category: {
    id: string;
    name: string;
    color?: string;
  } | null;
}

interface TimeTrackerGoalsSettingsProps {
  wsId: string;
}

export function TimeTrackerGoalsSettings({
  wsId,
}: TimeTrackerGoalsSettingsProps) {
  const t = useTranslations('settings.time_tracker');
  const tTracker = useTranslations('time-tracker');
  const queryClient = useQueryClient();
  const { data: categories } = useWorkspaceCategories({ wsId });

  const dailyGoalId = useId();
  const weeklyGoalId = useId();
  const editDailyGoalId = useId();
  const editWeeklyGoalId = useId();

  const { data: goals, isLoading: isLoadingGoals } = useQuery({
    queryKey: ['time-tracking-goals', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/goals`
      );
      if (!response.ok) throw new Error('Failed to fetch goals');
      const data = await response.json();
      return data.goals as TimeTrackingGoal[];
    },
  });

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState<TimeTrackingGoal | null>(
    null
  );
  const [goalToEdit, setGoalToEdit] = useState<TimeTrackingGoal | null>(null);

  // Form state
  const [categoryId, setCategoryId] = useState<string>('general');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(480);
  const [weeklyGoalMinutes, setWeeklyGoalMinutes] = useState(2400);
  const [isActive, setIsActive] = useState(true);

  const resetForm = () => {
    setCategoryId('general');
    setDailyGoalMinutes(480);
    setWeeklyGoalMinutes(2400);
    setIsActive(true);
  };

  const openAddDialog = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const openEditDialog = (goal: TimeTrackingGoal) => {
    setGoalToEdit(goal);
    setCategoryId(goal.category_id || 'general');
    setDailyGoalMinutes(goal.daily_goal_minutes);
    setWeeklyGoalMinutes(goal.weekly_goal_minutes || 2400);
    setIsActive(goal.is_active || true);
    setIsEditDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/goals`,
        {
          method: 'POST',
          body: JSON.stringify({
            categoryId: categoryId === 'general' ? null : categoryId,
            dailyGoalMinutes,
            weeklyGoalMinutes,
            isActive,
          }),
        }
      );
      if (!response.ok) throw new Error('Failed to create goal');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-goals', wsId],
      });
      setIsAddDialogOpen(false);
      resetForm();
      toast.success(tTracker('goals.create_success' as any));
    },
    onError: (error) => {
      console.error('Error creating goal:', error);
      toast.error(tTracker('goals.create_error' as any));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!goalToEdit) return;
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/goals/${goalToEdit.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            categoryId: categoryId === 'general' ? null : categoryId,
            dailyGoalMinutes,
            weeklyGoalMinutes,
            isActive,
          }),
        }
      );
      if (!response.ok) throw new Error('Failed to update goal');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-goals', wsId],
      });
      setIsEditDialogOpen(false);
      setGoalToEdit(null);
      resetForm();
      toast.success(tTracker('goals.update_success' as any));
    },
    onError: (error) => {
      console.error('Error updating goal:', error);
      toast.error(tTracker('goals.update_error' as any));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!goalToDelete) return;
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/goals/${goalToDelete.id}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) throw new Error('Failed to delete goal');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['time-tracking-goals', wsId],
      });
      setGoalToDelete(null);
      toast.success(tTracker('goals.delete_success' as any));
    },
    onError: (error) => {
      console.error('Error deleting goal:', error);
      toast.error(tTracker('goals.delete_error' as any));
    },
  });

  const getCategoryColor = (color: string) => {
    const colorMap: Record<string, string> = {
      RED: 'bg-red-500',
      BLUE: 'bg-blue-500',
      GREEN: 'bg-green-500',
      YELLOW: 'bg-yellow-500',
      ORANGE: 'bg-orange-500',
      PURPLE: 'bg-purple-500',
      PINK: 'bg-pink-500',
      INDIGO: 'bg-indigo-500',
      CYAN: 'bg-cyan-500',
      GRAY: 'bg-gray-500',
    };
    return colorMap[color] || 'bg-blue-500';
  };

  const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  if (isLoadingGoals) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Goal className="h-5 w-5 shrink-0" />
            <h3 className="font-medium text-lg">{t('goals')}</h3>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog} className="shrink-0">
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{t('add_goal')}</span>
                <span className="sm:hidden">{t('add_goal')}</span>
              </Button>
            </DialogTrigger>
          </Dialog>
        </div>

        {goals?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Goal className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg text-muted-foreground">
                {t('no_goals_title')}
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('no_goals_description')}
              </p>
              <Button
                onClick={openAddDialog}
                variant="outline"
                className="mt-4"
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('create_first_goal')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {goals?.map((goal) => (
              <Card key={goal.id} className="group relative">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-center gap-2">
                        {goal.category ? (
                          <div
                            className={cn(
                              'h-3 w-3 rounded-full',
                              getCategoryColor(goal.category.color || 'BLUE')
                            )}
                          />
                        ) : (
                          <div className="h-3 w-3 rounded-full bg-linear-to-br from-blue-500 to-purple-500" />
                        )}
                        <h3 className="truncate font-medium">
                          {goal.category?.name || t('general_goal')}
                        </h3>
                        {goal.is_active ? (
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          >
                            {t('active')}
                          </Badge>
                        ) : (
                          <Badge variant="outline">{t('inactive')}</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            {t('daily')}:{' '}
                            {formatMinutes(goal.daily_goal_minutes)}
                          </span>
                        </div>
                        {goal.weekly_goal_minutes && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {t('weekly')}:{' '}
                              {formatMinutes(goal.weekly_goal_minutes)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(goal)}>
                          <Edit className="mr-2 h-4 w-4" />
                          {t('edit_goal')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setGoalToDelete(goal)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('delete_goal')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Goal Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {t('create_new_goal')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="goal-category">{t('goal_type')}</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('select_goal_type')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-linear-to-br from-blue-500 to-purple-500" />
                      <span>{t('general_goal')}</span>
                    </div>
                  </SelectItem>
                  {categories?.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-3 w-3 rounded-full',
                            getCategoryColor(category.color || 'BLUE')
                          )}
                        />
                        <span>{category.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={dailyGoalId}>{t('daily_goal_min')}</Label>
              <Input
                id={dailyGoalId}
                type="number"
                value={dailyGoalMinutes}
                onChange={(e) => setDailyGoalMinutes(Number(e.target.value))}
                min="15"
                max="1440"
              />
              <p className="mt-1 text-muted-foreground text-xs">
                {t('target_per_day', {
                  time: formatMinutes(dailyGoalMinutes),
                })}
              </p>
            </div>
            <div>
              <Label htmlFor={weeklyGoalId}>{t('weekly_goal_min')}</Label>
              <Input
                id={weeklyGoalId}
                type="number"
                value={weeklyGoalMinutes}
                onChange={(e) => setWeeklyGoalMinutes(Number(e.target.value))}
                min="15"
                max="10080"
              />
              <p className="mt-1 text-muted-foreground text-xs">
                {t('target_per_week', {
                  time: formatMinutes(weeklyGoalMinutes),
                })}
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Switch
                id="goal-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="goal-active">{t('active_goal')}</Label>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                className="flex-1"
              >
                {t('categories_management.cancel')}
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="flex-1"
              >
                {createMutation.isPending
                  ? t('creating')
                  : t('create_new_goal')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Goal Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              {t('edit_goal')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-goal-category">{t('goal_type')}</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('select_goal_type')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-linear-to-br from-blue-500 to-purple-500" />
                      <span>{t('general_goal')}</span>
                    </div>
                  </SelectItem>
                  {categories?.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-3 w-3 rounded-full',
                            getCategoryColor(category.color || 'BLUE')
                          )}
                        />
                        <span>{category.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={editDailyGoalId}>{t('daily_goal_min')}</Label>
              <Input
                id={editDailyGoalId}
                type="number"
                value={dailyGoalMinutes}
                onChange={(e) => setDailyGoalMinutes(Number(e.target.value))}
                min="15"
                max="1440"
              />
              <p className="mt-1 text-muted-foreground text-xs">
                {t('target_per_day', {
                  time: formatMinutes(dailyGoalMinutes),
                })}
              </p>
            </div>
            <div>
              <Label htmlFor={editWeeklyGoalId}>{t('weekly_goal_min')}</Label>
              <Input
                id={editWeeklyGoalId}
                type="number"
                value={weeklyGoalMinutes}
                onChange={(e) => setWeeklyGoalMinutes(Number(e.target.value))}
                min="15"
                max="10080"
              />
              <p className="mt-1 text-muted-foreground text-xs">
                {t('target_per_week', {
                  time: formatMinutes(weeklyGoalMinutes),
                })}
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Switch
                id="edit-goal-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="edit-goal-active">{t('active_goal')}</Label>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                className="flex-1"
              >
                {t('categories_management.cancel')}
              </Button>
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                className="flex-1"
              >
                {updateMutation.isPending ? t('updating') : t('edit_goal')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!goalToDelete}
        onOpenChange={() => setGoalToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_goal')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_goal_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t('categories_management.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? t('deleting') : t('delete_goal')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
