'use client';

import type { TimeTrackingCategory } from '@tuturuuu/types/db';
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
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
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
import {
  Calendar,
  CheckCircle,
  Clock,
  Edit,
  Goal,
  MoreHorizontal,
  Plus,
  Target,
  Trash2,
  TrendingUp,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
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
import { useState } from 'react';

interface TimeTrackingGoal {
  id: string;
  ws_id: string;
  user_id: string;
  category_id?: string;
  daily_goal_minutes: number;
  weekly_goal_minutes?: number;
  is_active: boolean;
  category?: TimeTrackingCategory;
}

interface TimerStats {
  todayTime: number;
  weekTime: number;
  monthTime: number;
  streak: number;
  categoryBreakdown?: {
    today: Record<string, number>;
    week: Record<string, number>;
    month: Record<string, number>;
  };
}

interface GoalManagerProps {
  wsId: string;
  goals: TimeTrackingGoal[];
  categories: TimeTrackingCategory[];
  timerStats: TimerStats;
  onGoalsUpdate: () => void;
  readOnly?: boolean;
  // eslint-disable-next-line no-unused-vars
  formatDuration: (seconds: number) => string;
  // eslint-disable-next-line no-unused-vars
  apiCall: (url: string, options?: RequestInit) => Promise<any>;
}

export function GoalManager({
  wsId,
  goals,
  categories,
  timerStats,
  onGoalsUpdate,
  readOnly = false,
  formatDuration,
  apiCall,
}: GoalManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState<TimeTrackingGoal | null>(
    null
  );
  const [goalToEdit, setGoalToEdit] = useState<TimeTrackingGoal | null>(null);

  // Form state
  const [categoryId, setCategoryId] = useState<string>('general');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(480); // 8 hours default
  const [weeklyGoalMinutes, setWeeklyGoalMinutes] = useState(2400); // 40 hours default
  const [isActive, setIsActive] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    setIsActive(goal.is_active);
    setIsEditDialogOpen(true);
  };

  const createGoal = async () => {
    setIsLoading(true);

    try {
      await apiCall(`/api/v1/workspaces/${wsId}/time-tracking/goals`, {
        method: 'POST',
        body: JSON.stringify({
          categoryId: categoryId === 'general' ? null : categoryId,
          dailyGoalMinutes,
          weeklyGoalMinutes,
          isActive,
        }),
      });

      setIsAddDialogOpen(false);
      resetForm();
      onGoalsUpdate();
      toast.success('Goal created successfully');
    } catch (error) {
      console.error('Error creating goal:', error);
      toast.error('Failed to create goal');
    } finally {
      setIsLoading(false);
    }
  };

  const updateGoal = async () => {
    if (!goalToEdit) return;

    setIsLoading(true);

    try {
      await apiCall(
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

      setIsEditDialogOpen(false);
      setGoalToEdit(null);
      resetForm();
      onGoalsUpdate();
      toast.success('Goal updated successfully');
    } catch (error) {
      console.error('Error updating goal:', error);
      toast.error('Failed to update goal');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteGoal = async () => {
    if (!goalToDelete) return;

    setIsDeleting(true);

    try {
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/goals/${goalToDelete.id}`,
        {
          method: 'DELETE',
        }
      );

      setGoalToDelete(null);
      onGoalsUpdate();
      toast.success('Goal deleted successfully');
    } catch (error) {
      console.error('Error deleting goal:', error);
      toast.error('Failed to delete goal');
    } finally {
      setIsDeleting(false);
    }
  };

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

  const calculateProgress = (
    actualSeconds: number,
    goalMinutes: number
  ): number => {
    const actualMinutes = Math.floor(actualSeconds / 60);
    return Math.min((actualMinutes / goalMinutes) * 100, 100);
  };

  // Get time for a specific goal (category-specific or general)
  const getTimeForGoal = (
    goal: TimeTrackingGoal,
    period: 'today' | 'week'
  ): number => {
    if (!timerStats.categoryBreakdown) {
      // Fallback to overall stats if breakdown not available
      return period === 'today' ? timerStats.todayTime : timerStats.weekTime;
    }

    const breakdown = timerStats.categoryBreakdown[period];

    if (!goal.category_id) {
      // General goal: sum all time regardless of category
      return Object.values(breakdown).reduce((sum, time) => sum + time, 0);
    } else {
      // Category-specific goal: only time from that category
      return breakdown[goal.category_id] || 0;
    }
  };

  const activeGoals = goals.filter((goal) => goal.is_active);

  return (
    <>
      <div className="space-y-6">
        {/* Overall Progress Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Goal className="h-5 w-5" />
              Daily & Weekly Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Daily Progress */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">Today's Progress</span>
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {formatDuration(timerStats.todayTime)}
                  </span>
                </div>
                {activeGoals.length > 0 ? (
                  <div className="space-y-2">
                    {activeGoals.map((goal) => {
                      const goalTodayTime = getTimeForGoal(goal, 'today');
                      const progress = calculateProgress(
                        goalTodayTime,
                        goal.daily_goal_minutes
                      );
                      return (
                        <div key={goal.id} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                              {goal.category && (
                                <div
                                  className={cn(
                                    'h-3 w-3 rounded-full',
                                    getCategoryColor(
                                      goal.category.color || 'BLUE'
                                    )
                                  )}
                                />
                              )}
                              {goal.category?.name || 'General'} goal
                            </span>
                            <span className="text-muted-foreground">
                              {Math.round(progress)}%
                            </span>
                          </div>
                          <Progress value={progress} className="h-2" />
                          <div className="text-muted-foreground flex justify-between text-xs">
                            <span>{formatDuration(goalTodayTime)}</span>
                            <span>
                              {formatMinutes(goal.daily_goal_minutes)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-muted-foreground py-4 text-center">
                    <Target className="mx-auto mb-2 h-8 w-8" />
                    <p className="text-sm">No daily goals set</p>
                  </div>
                )}
              </div>

              {/* Weekly Progress */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="font-medium">This Week's Progress</span>
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {formatDuration(timerStats.weekTime)}
                  </span>
                </div>
                {activeGoals.length > 0 ? (
                  <div className="space-y-2">
                    {activeGoals
                      .filter((goal) => goal.weekly_goal_minutes)
                      .map((goal) => {
                        const goalWeekTime = getTimeForGoal(goal, 'week');
                        const progress = calculateProgress(
                          goalWeekTime,
                          goal.weekly_goal_minutes!
                        );
                        return (
                          <div key={goal.id} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-2">
                                {goal.category && (
                                  <div
                                    className={cn(
                                      'h-3 w-3 rounded-full',
                                      getCategoryColor(
                                        goal.category.color || 'BLUE'
                                      )
                                    )}
                                  />
                                )}
                                {goal.category?.name || 'General'} goal
                              </span>
                              <span className="text-muted-foreground">
                                {Math.round(progress)}%
                              </span>
                            </div>
                            <Progress value={progress} className="h-2" />
                            <div className="text-muted-foreground flex justify-between text-xs">
                              <span>{formatDuration(goalWeekTime)}</span>
                              <span>
                                {formatMinutes(goal.weekly_goal_minutes!)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="text-muted-foreground py-4 text-center">
                    <Target className="mx-auto mb-2 h-8 w-8" />
                    <p className="text-sm">No weekly goals set</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Goals Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Goal Management
              </CardTitle>
              {!readOnly && (
                <Dialog
                  open={isAddDialogOpen}
                  onOpenChange={setIsAddDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button onClick={openAddDialog}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Goal
                    </Button>
                  </DialogTrigger>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {goals.length === 0 ? (
              <div className="py-12 text-center">
                <div className="relative mx-auto mb-4 h-16 w-16">
                  <Goal className="text-muted-foreground/50 h-16 w-16" />
                  <Target className="text-primary absolute -right-1 -top-1 h-6 w-6 animate-pulse" />
                </div>
                <p className="text-muted-foreground text-lg font-medium">
                  Ready to set your time goals?
                </p>
                <p className="text-muted-foreground mt-2 text-sm">
                  Create daily and weekly time goals to track your productivity.
                  <br />
                  Set goals for specific categories or general time tracking.
                </p>
                {!readOnly && (
                  <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <Button onClick={openAddDialog} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Create First Goal
                    </Button>
                    <Button
                      onClick={openAddDialog}
                      variant="outline"
                      className="gap-2"
                    >
                      <Target className="h-4 w-4" />
                      Learn About Goals
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {goals.map((goal) => {
                  const goalTodayTime = getTimeForGoal(goal, 'today');
                  const goalWeekTime = getTimeForGoal(goal, 'week');

                  const dailyProgress = calculateProgress(
                    goalTodayTime,
                    goal.daily_goal_minutes
                  );
                  const weeklyProgress = goal.weekly_goal_minutes
                    ? calculateProgress(goalWeekTime, goal.weekly_goal_minutes)
                    : null;

                  return (
                    <Card
                      key={goal.id}
                      className="group relative border-l-4 transition-all hover:shadow-lg"
                      style={{
                        borderLeftColor: goal.category
                          ? `rgb(${
                              goal.category.color === 'RED'
                                ? '239 68 68'
                                : goal.category.color === 'BLUE'
                                  ? '59 130 246'
                                  : goal.category.color === 'GREEN'
                                    ? '34 197 94'
                                    : goal.category.color === 'YELLOW'
                                      ? '234 179 8'
                                      : goal.category.color === 'ORANGE'
                                        ? '249 115 22'
                                        : goal.category.color === 'PURPLE'
                                          ? '168 85 247'
                                          : goal.category.color === 'PINK'
                                            ? '236 72 153'
                                            : goal.category.color === 'INDIGO'
                                              ? '99 102 241'
                                              : goal.category.color === 'CYAN'
                                                ? '6 182 212'
                                                : '107 114 128' // GRAY
                            })`
                          : 'rgb(99 102 241)', // Indigo for general goals
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-3">
                              {goal.category ? (
                                <div
                                  className={cn(
                                    'h-4 w-4 rounded-full',
                                    getCategoryColor(
                                      goal.category.color || 'BLUE'
                                    )
                                  )}
                                />
                              ) : (
                                <div className="h-4 w-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-500" />
                              )}
                              <h3 className="font-medium">
                                {goal.category?.name || 'General'} Goal
                              </h3>
                              {!goal.category && (
                                <Badge variant="outline" className="text-xs">
                                  All Categories
                                </Badge>
                              )}
                              <div className="flex items-center gap-2">
                                {goal.is_active ? (
                                  <Badge
                                    variant="secondary"
                                    className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                                  >
                                    <CheckCircle className="mr-1 h-3 w-3" />
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Inactive</Badge>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              {/* Daily Goal */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Daily Goal
                                  </span>
                                  <span className="text-muted-foreground">
                                    {Math.round(dailyProgress)}%
                                  </span>
                                </div>
                                <Progress
                                  value={dailyProgress}
                                  className="h-2"
                                />
                                <div className="text-muted-foreground flex justify-between text-xs">
                                  <span>{formatDuration(goalTodayTime)}</span>
                                  <span>
                                    {formatMinutes(goal.daily_goal_minutes)}
                                  </span>
                                </div>
                              </div>

                              {/* Weekly Goal */}
                              {goal.weekly_goal_minutes && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      Weekly Goal
                                    </span>
                                    <span className="text-muted-foreground">
                                      {Math.round(weeklyProgress || 0)}%
                                    </span>
                                  </div>
                                  <Progress
                                    value={weeklyProgress || 0}
                                    className="h-2"
                                  />
                                  <div className="text-muted-foreground flex justify-between text-xs">
                                    <span>{formatDuration(goalWeekTime)}</span>
                                    <span>
                                      {formatMinutes(goal.weekly_goal_minutes)}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {!readOnly && (
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
                                <DropdownMenuItem
                                  onClick={() => openEditDialog(goal)}
                                >
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit Goal
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setGoalToDelete(goal)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Goal
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Goal Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Create New Goal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="goal-category" className="text-sm font-medium">
                Goal Type
              </Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select goal type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-br from-blue-500 to-purple-500" />
                      <div className="flex flex-col items-start justify-start">
                        <div className="font-medium">General Goal</div>
                        <div className="text-muted-foreground text-xs">
                          Tracks time across all categories
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-3 w-3 rounded-full',
                            getCategoryColor(category.color || 'BLUE')
                          )}
                        />
                        <div className="flex flex-col items-start justify-start">
                          <div className="font-medium">{category.name}</div>
                          <div className="text-muted-foreground text-xs">
                            Category-specific goal
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {categoryId === 'general'
                  ? 'This goal will track time from all your sessions, regardless of category.'
                  : categories.find((c) => c.id === categoryId)
                    ? `This goal will only track time from sessions in the "${categories.find((c) => c.id === categoryId)?.name}" category.`
                    : 'Choose whether to track all time or time from a specific category.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="daily-goal"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Clock className="h-4 w-4" />
                Daily Goal (minutes)
              </Label>
              <Input
                id="daily-goal"
                type="number"
                value={dailyGoalMinutes}
                onChange={(e) => setDailyGoalMinutes(Number(e.target.value))}
                placeholder="480"
                min="15"
                max="1440"
              />
              <p className="text-muted-foreground text-xs">
                Target:{' '}
                <span className="font-medium">
                  {formatMinutes(dailyGoalMinutes)}
                </span>{' '}
                per day
                {dailyGoalMinutes > 0 && (
                  <span className="ml-2 text-xs">
                    ({Math.round((dailyGoalMinutes / 60) * 100) / 100} hours)
                  </span>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="weekly-goal"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Calendar className="h-4 w-4" />
                Weekly Goal (minutes, optional)
              </Label>
              <Input
                id="weekly-goal"
                type="number"
                value={weeklyGoalMinutes}
                onChange={(e) => setWeeklyGoalMinutes(Number(e.target.value))}
                placeholder="2400"
                min="15"
                max="10080"
              />
              <p className="text-muted-foreground text-xs">
                Target:{' '}
                <span className="font-medium">
                  {formatMinutes(weeklyGoalMinutes)}
                </span>{' '}
                per week
                {weeklyGoalMinutes > 0 && (
                  <span className="ml-2 text-xs">
                    ({Math.round((weeklyGoalMinutes / 60) * 100) / 100} hours)
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="goal-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="goal-active">Active goal</Label>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={createGoal}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? 'Creating...' : 'Create Goal'}
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
              Edit Goal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="edit-goal-category"
                className="text-sm font-medium"
              >
                Goal Type
              </Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select goal type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-br from-blue-500 to-purple-500" />
                      <div className="flex flex-col items-start justify-start">
                        <div className="font-medium">General Goal</div>
                        <div className="text-muted-foreground text-xs">
                          Tracks time across all categories
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-3 w-3 rounded-full',
                            getCategoryColor(category.color || 'BLUE')
                          )}
                        />
                        <div className="flex flex-col items-start justify-start">
                          <div className="font-medium">{category.name}</div>
                          <div className="text-muted-foreground text-xs">
                            Category-specific goal
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {categoryId === 'general'
                  ? 'This goal will track time from all your sessions, regardless of category.'
                  : categories.find((c) => c.id === categoryId)
                    ? `This goal will only track time from sessions in the "${categories.find((c) => c.id === categoryId)?.name}" category.`
                    : 'Choose whether to track all time or time from a specific category.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="edit-daily-goal"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Clock className="h-4 w-4" />
                Daily Goal (minutes)
              </Label>
              <Input
                id="edit-daily-goal"
                type="number"
                value={dailyGoalMinutes}
                onChange={(e) => setDailyGoalMinutes(Number(e.target.value))}
                placeholder="480"
                min="15"
                max="1440"
              />
              <p className="text-muted-foreground text-xs">
                Target:{' '}
                <span className="font-medium">
                  {formatMinutes(dailyGoalMinutes)}
                </span>{' '}
                per day
                {dailyGoalMinutes > 0 && (
                  <span className="ml-2 text-xs">
                    ({Math.round((dailyGoalMinutes / 60) * 100) / 100} hours)
                  </span>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="edit-weekly-goal"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Calendar className="h-4 w-4" />
                Weekly Goal (minutes, optional)
              </Label>
              <Input
                id="edit-weekly-goal"
                type="number"
                value={weeklyGoalMinutes}
                onChange={(e) => setWeeklyGoalMinutes(Number(e.target.value))}
                placeholder="2400"
                min="15"
                max="10080"
              />
              <p className="text-muted-foreground text-xs">
                Target:{' '}
                <span className="font-medium">
                  {formatMinutes(weeklyGoalMinutes)}
                </span>{' '}
                per week
                {weeklyGoalMinutes > 0 && (
                  <span className="ml-2 text-xs">
                    ({Math.round((weeklyGoalMinutes / 60) * 100) / 100} hours)
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="edit-goal-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="edit-goal-active">Active goal</Label>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={updateGoal}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? 'Updating...' : 'Update Goal'}
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
            <AlertDialogTitle>Delete Goal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this goal? This action cannot be
              undone and will permanently remove the goal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteGoal}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Goal'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
