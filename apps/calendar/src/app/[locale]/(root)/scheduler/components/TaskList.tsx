'use client';

import type { Event, Task, TaskPriority } from '@tuturuuu/ai/scheduling/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  PlusIcon,
  SplitIcon,
  Trash2Icon,
  ZapIcon,
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
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import dayjs from 'dayjs';
import { useMemo } from 'react';

interface TaskListProps {
  tasks: Task[];
  events: Event[];
  isScheduling: boolean;
  onAddTask: () => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  onSchedule: () => void;
}

const getCategoryColor = (category: 'work' | 'personal' | 'meeting') => {
  switch (category) {
    case 'work':
      return 'bg-gradient-to-r from-blue-500/10 to-blue-600/10 text-blue-700 border-blue-200 dark:border-blue-800';
    case 'personal':
      return 'bg-gradient-to-r from-green-500/10 to-emerald-600/10 text-green-700 border-green-200 dark:border-green-800';
    case 'meeting':
      return 'bg-gradient-to-r from-orange-500/10 to-amber-600/10 text-orange-700 border-orange-200 dark:border-orange-800';
    default:
      return 'bg-gradient-to-r from-gray-500/10 to-gray-600/10 text-gray-700 border-gray-200 dark:border-gray-800';
  }
};

const getCategoryIcon = (category: 'work' | 'personal' | 'meeting') => {
  switch (category) {
    case 'work':
      return '💼';
    case 'personal':
      return '🏠';
    case 'meeting':
      return '👥';
    default:
      return '📋';
  }
};

const getPriorityColor = (priority: TaskPriority) => {
  switch (priority) {
    case 'critical':
      return 'bg-gradient-to-r from-red-500/10 to-rose-600/10 text-red-700 border-red-200 dark:border-red-800';
    case 'high':
      return 'bg-gradient-to-r from-orange-500/10 to-amber-600/10 text-orange-700 border-orange-200 dark:border-orange-800';
    case 'normal':
      return 'bg-gradient-to-r from-blue-500/10 to-blue-600/10 text-blue-700 border-blue-200 dark:border-blue-800';
    case 'low':
      return 'bg-gradient-to-r from-gray-500/10 to-gray-600/10 text-gray-700 border-gray-200 dark:border-gray-800';
    default:
      return 'bg-gradient-to-r from-gray-500/10 to-gray-600/10 text-gray-700 border-gray-200 dark:border-gray-800';
  }
};

const getPriorityIcon = (priority: TaskPriority) => {
  switch (priority) {
    case 'critical':
      return '🚨';
    case 'high':
      return '⚡';
    case 'normal':
      return '📋';
    case 'low':
      return '📝';
    default:
      return '📋';
  }
};

export function TaskList({
  tasks,
  events,
  isScheduling,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onSchedule,
}: TaskListProps) {
  const taskProgress = useMemo(() => {
    const progressMap = new Map<
      string,
      { completed: number; remaining: number }
    >();

    tasks.forEach((task) => {
      const taskEvents = events.filter((event) => event.taskId === task.id);
      const completedTime = taskEvents.reduce((sum, event) => {
        return sum + event.range.end.diff(event.range.start, 'hour', true);
      }, 0);

      progressMap.set(task.id, {
        completed: completedTime,
        remaining: Math.max(0, task.duration - completedTime),
      });
    });

    return progressMap;
  }, [tasks, events]);

  const totalDuration = tasks.reduce((sum, task) => sum + task.duration, 0);
  const completedTasks = tasks.filter((task) => {
    const progress = taskProgress.get(task.id);
    return progress && progress.remaining === 0;
  }).length;

  const priorityStats = useMemo(() => {
    const stats = {
      critical: tasks.filter((t) => t.priority === 'critical').length,
      high: tasks.filter((t) => t.priority === 'high').length,
      normal: tasks.filter((t) => t.priority === 'normal').length,
      low: tasks.filter((t) => t.priority === 'low').length,
    };
    return stats;
  }, [tasks]);

  const getDeadlineStatus = (deadline?: dayjs.Dayjs) => {
    if (!deadline) return null;

    const now = dayjs();
    const hoursUntil = deadline.diff(now, 'hour', true);

    if (hoursUntil < 0) {
      return {
        type: 'overdue',
        text: 'Overdue',
        color:
          'text-red-600 bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800',
      };
    } else if (hoursUntil < 24) {
      return {
        type: 'urgent',
        text: `${Math.round(hoursUntil)}h left`,
        color:
          'text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800',
      };
    } else if (hoursUntil < 72) {
      return {
        type: 'soon',
        text: `${Math.round(hoursUntil / 24)}d left`,
        color:
          'text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800',
      };
    } else {
      return {
        type: 'later',
        text: deadline.format('MMM D'),
        color: 'text-muted-foreground bg-muted/50 border-border',
      };
    }
  };

  return (
    <div className="space-y-8">
      {/* Header with Stats */}
      <Card className="border-0 bg-gradient-to-br from-white to-gray-50/50 shadow-lg dark:from-gray-900 dark:to-gray-800/50">
        <CardHeader className="pb-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-3 font-bold text-2xl">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg">
                  <CalendarIcon className="h-5 w-5" />
                </div>
                Task Management
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                Organize and track your tasks with intelligent scheduling
              </CardDescription>
            </div>
            <Button
              onClick={onAddTask}
              size="lg"
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg transition-all duration-200 hover:from-blue-600 hover:to-purple-700"
            >
              <PlusIcon className="mr-2 h-5 w-5" />
              Add Task
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-6">
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text font-bold text-3xl text-transparent">
                {tasks.length}
              </div>
              <div className="font-medium text-muted-foreground text-sm">
                Total Tasks
              </div>
            </div>
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-green-600 to-emerald-700 bg-clip-text font-bold text-3xl text-transparent">
                {completedTasks}
              </div>
              <div className="font-medium text-muted-foreground text-sm">
                Completed
              </div>
            </div>
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-orange-600 to-amber-700 bg-clip-text font-bold text-3xl text-transparent">
                {totalDuration}h
              </div>
              <div className="font-medium text-muted-foreground text-sm">
                Total Time
              </div>
            </div>
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-red-600 to-rose-700 bg-clip-text font-bold text-3xl text-transparent">
                {priorityStats.critical}
              </div>
              <div className="font-medium text-muted-foreground text-sm">
                Critical
              </div>
            </div>
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-orange-600 to-amber-700 bg-clip-text font-bold text-3xl text-transparent">
                {priorityStats.high}
              </div>
              <div className="font-medium text-muted-foreground text-sm">
                High
              </div>
            </div>
            <div className="space-y-2 text-center">
              <div className="bg-gradient-to-r from-purple-600 to-pink-700 bg-clip-text font-bold text-3xl text-transparent">
                {tasks.filter((t) => t.deadline).length}
              </div>
              <div className="font-medium text-muted-foreground text-sm">
                With Deadlines
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks List */}
      <Card className="border-0 bg-white shadow-lg dark:bg-gray-900">
        <CardHeader className="pb-6">
          <div className="space-y-2">
            <CardTitle className="font-bold text-xl">Your Tasks</CardTitle>
            <CardDescription className="text-base">
              Manage task details and constraints for intelligent scheduling
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20">
                <CalendarIcon className="h-10 w-10 text-blue-500" />
              </div>
              <h3 className="mb-3 font-semibold text-xl">No Tasks Yet</h3>
              <p className="mx-auto mb-6 max-w-md text-muted-foreground">
                Add some tasks or load a template to get started with
                intelligent scheduling
              </p>
              <Button
                onClick={onAddTask}
                size="lg"
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg transition-all duration-200 hover:from-blue-600 hover:to-purple-700"
              >
                <PlusIcon className="mr-2 h-5 w-5" />
                Create Your First Task
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {tasks.map((task) => {
                const progress = taskProgress.get(task.id);
                const progressPercentage = progress
                  ? (progress.completed / task.duration) * 100
                  : 0;
                const deadlineStatus = getDeadlineStatus(task.deadline);
                const isCompleted = progress?.remaining === 0;

                return (
                  <div
                    key={task.id}
                    className={`group relative space-y-6 rounded-xl border-2 p-6 transition-all duration-200 hover:shadow-xl ${
                      isCompleted
                        ? 'border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 dark:border-green-800 dark:from-green-950/20 dark:to-emerald-950/20'
                        : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-gradient-to-br hover:from-blue-50/50 hover:to-purple-50/50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-700 dark:hover:from-blue-950/20 dark:hover:to-purple-950/20'
                    }`}
                  >
                    {/* Task Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-4">
                          <div
                            className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl shadow-lg ${
                              isCompleted
                                ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                                : 'bg-gradient-to-br from-blue-500 to-purple-600'
                            }`}
                          >
                            <span className="text-white">
                              {getCategoryIcon(task.category)}
                            </span>
                          </div>
                          <div className="flex-1">
                            <Input
                              placeholder="Task name"
                              value={task.name}
                              onChange={(e) =>
                                onUpdateTask(task.id, { name: e.target.value })
                              }
                              className={`h-auto border-none bg-transparent p-0 font-bold text-xl focus-visible:ring-0 ${
                                isCompleted
                                  ? 'text-muted-foreground line-through'
                                  : 'text-gray-900 dark:text-white'
                              }`}
                            />
                          </div>
                          {/* Split Toggle Button */}
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
                                  <SplitIcon className="h-4 w-4 text-blue-600" />
                                  <Switch
                                    id={`split-toggle-${task.id}`}
                                    checked={task.allowSplit ?? true}
                                    onCheckedChange={(checked) =>
                                      onUpdateTask(task.id, {
                                        allowSplit: checked,
                                      })
                                    }
                                    className="scale-90"
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                Allow this task to be split into sessions
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          {isCompleted && (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white shadow-lg">
                              <CheckCircleIcon className="h-5 w-5" />
                            </div>
                          )}
                        </div>

                        {/* Progress Bar */}
                        {progress && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium text-muted-foreground">
                                Progress: {progress.completed.toFixed(1)}h /{' '}
                                {task.duration}h
                              </span>
                              <span
                                className={`font-bold text-lg ${isCompleted ? 'text-green-600' : 'text-blue-600'}`}
                              >
                                {Math.round(progressPercentage)}%
                              </span>
                            </div>
                            <div className="relative">
                              <Progress
                                value={progressPercentage}
                                className="h-3 bg-gray-200 dark:bg-gray-700"
                              />
                              <div
                                className={`absolute inset-0 rounded-full bg-gradient-to-r ${
                                  isCompleted
                                    ? 'from-green-500 to-emerald-600'
                                    : 'from-blue-500 to-purple-600'
                                } opacity-20`}
                              ></div>
                            </div>
                            {progress.remaining > 0 && (
                              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <ClockIcon className="h-4 w-4" />
                                <span className="font-medium">
                                  {progress.remaining.toFixed(1)}h remaining
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tags */}
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge
                            className={`${getCategoryColor(task.category)} px-3 py-1 font-semibold`}
                          >
                            {task.category}
                          </Badge>

                          <Badge
                            className={`${getPriorityColor(task.priority)} px-3 py-1 font-semibold`}
                          >
                            <span className="mr-1">
                              {getPriorityIcon(task.priority)}
                            </span>
                            {task.priority}
                          </Badge>

                          {deadlineStatus && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge
                                  variant="outline"
                                  className={`${deadlineStatus.color} px-3 py-1 font-semibold`}
                                >
                                  <CalendarIcon className="mr-1 h-3 w-3" />
                                  {deadlineStatus.text}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  Deadline:{' '}
                                  {task.deadline?.format('MMM D, YYYY HH:mm')}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {task.maxDuration < task.duration && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge
                                  variant="outline"
                                  className="border-purple-200 bg-purple-50 px-3 py-1 font-semibold text-purple-600 dark:border-purple-800 dark:bg-purple-950/20"
                                >
                                  <ZapIcon className="mr-1 h-3 w-3" />
                                  Splittable
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  This task can be split into smaller chunks
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteTask(task.id)}
                        className="text-muted-foreground opacity-0 transition-all duration-200 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950/20"
                      >
                        <Trash2Icon className="h-5 w-5" />
                      </Button>
                    </div>

                    {/* Task Details */}
                    <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
                      <div className="space-y-2">
                        <Label className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                          Duration (hours)
                        </Label>
                        <Input
                          type="number"
                          step="0.25"
                          min="0.25"
                          value={task.duration}
                          onChange={(e) =>
                            onUpdateTask(task.id, {
                              duration: parseFloat(e.target.value),
                            })
                          }
                          className="border-gray-200 text-sm focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                          Min Duration
                        </Label>
                        <Input
                          type="number"
                          step="0.25"
                          min="0.25"
                          value={task.minDuration}
                          onChange={(e) =>
                            onUpdateTask(task.id, {
                              minDuration: parseFloat(e.target.value),
                            })
                          }
                          className="border-gray-200 text-sm focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                          Max Duration
                        </Label>
                        <Input
                          type="number"
                          step="0.25"
                          min="0.25"
                          value={task.maxDuration}
                          onChange={(e) =>
                            onUpdateTask(task.id, {
                              maxDuration: parseFloat(e.target.value),
                            })
                          }
                          className="border-gray-200 text-sm focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                          Category
                        </Label>
                        <Select
                          value={task.category}
                          onValueChange={(
                            value: 'work' | 'personal' | 'meeting'
                          ) => onUpdateTask(task.id, { category: value })}
                        >
                          <SelectTrigger className="border-gray-200 text-sm focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="work">💼 Work</SelectItem>
                            <SelectItem value="personal">
                              🏠 Personal
                            </SelectItem>
                            <SelectItem value="meeting">👥 Meeting</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                          Priority
                        </Label>
                        <Select
                          value={task.priority}
                          onValueChange={(value: TaskPriority) =>
                            onUpdateTask(task.id, { priority: value })
                          }
                        >
                          <SelectTrigger className="border-gray-200 text-sm focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="critical">
                              🚨 Critical
                            </SelectItem>
                            <SelectItem value="high">⚡ High</SelectItem>
                            <SelectItem value="normal">📋 Normal</SelectItem>
                            <SelectItem value="low">📝 Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Deadline */}
                    <div className="space-y-2">
                      <Label className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                        Deadline (Optional)
                      </Label>
                      <Input
                        type="datetime-local"
                        value={
                          task.deadline
                            ? task.deadline.format('YYYY-MM-DDTHH:mm')
                            : ''
                        }
                        onChange={(e) =>
                          onUpdateTask(task.id, {
                            deadline: e.target.value
                              ? dayjs(e.target.value)
                              : undefined,
                          })
                        }
                        className="border-gray-200 text-sm focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400"
                        min={dayjs().format('YYYY-MM-DDTHH:mm')}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>

        {tasks.length > 0 && (
          <div className="p-6 pt-0">
            <Button
              onClick={onSchedule}
              size="lg"
              className="h-12 w-full bg-gradient-to-r from-blue-500 to-purple-600 font-semibold text-lg text-white shadow-lg transition-all duration-200 hover:from-blue-600 hover:to-purple-700"
              disabled={isScheduling}
            >
              {isScheduling ? (
                <>
                  <ClockIcon className="mr-2 h-5 w-5 animate-spin" />
                  Generating Schedule...
                </>
              ) : (
                <>
                  <CalendarIcon className="mr-2 h-5 w-5" />
                  Generate Optimized Schedule
                </>
              )}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
