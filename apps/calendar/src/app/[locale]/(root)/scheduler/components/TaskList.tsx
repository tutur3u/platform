'use client';

import type { Event, Task } from '@tuturuuu/ai/scheduling/types';
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
  Trash2Icon,
  ZapIcon,
} from '@tuturuuu/ui/icons';
import { SplitIcon } from '@tuturuuu/ui/icons';
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
      return 'bg-dynamic-blue/10 text-dynamic-blue border-dynamic-blue/30';
    case 'personal':
      return 'bg-dynamic-green/10 text-dynamic-green border-dynamic-green/30';
    case 'meeting':
      return 'bg-dynamic-orange/10 text-dynamic-orange border-dynamic-orange/30';
    default:
      return 'bg-dynamic-gray/10 text-dynamic-gray border-dynamic-gray/30';
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

  const getDeadlineStatus = (deadline?: dayjs.Dayjs) => {
    if (!deadline) return null;

    const now = dayjs();
    const hoursUntil = deadline.diff(now, 'hour', true);

    if (hoursUntil < 0) {
      return { type: 'overdue', text: 'Overdue', color: 'text-destructive' };
    } else if (hoursUntil < 24) {
      return {
        type: 'urgent',
        text: `${Math.round(hoursUntil)}h left`,
        color: 'text-dynamic-orange',
      };
    } else if (hoursUntil < 72) {
      return {
        type: 'soon',
        text: `${Math.round(hoursUntil / 24)}d left`,
        color: 'text-dynamic-yellow',
      };
    } else {
      return {
        type: 'later',
        text: deadline.format('MMM D'),
        color: 'text-muted-foreground',
      };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Task Management
              </CardTitle>
              <CardDescription>
                Organize and track your tasks with intelligent scheduling
              </CardDescription>
            </div>
            <Button onClick={onAddTask} size="sm">
              <PlusIcon className="mr-2 h-4 w-4" />
              Add Task
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-dynamic-blue">
                {tasks.length}
              </div>
              <div className="text-sm text-muted-foreground">Total Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-dynamic-green">
                {completedTasks}
              </div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-dynamic-orange">
                {totalDuration}h
              </div>
              <div className="text-sm text-muted-foreground">Total Time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-dynamic-purple">
                {tasks.filter((t) => t.deadline).length}
              </div>
              <div className="text-sm text-muted-foreground">
                With Deadlines
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Tasks</CardTitle>
          <CardDescription>
            Manage task details and constraints for intelligent scheduling
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarIcon className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
              <h3 className="mb-2 text-lg font-semibold">No Tasks Yet</h3>
              <p className="mb-4 text-muted-foreground">
                Add some tasks or load a template to get started with scheduling
              </p>
              <Button onClick={onAddTask} size="lg">
                <PlusIcon className="mr-2 h-4 w-4" />
                Create Your First Task
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
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
                    className={`group relative space-y-4 rounded-lg border p-6 transition-all hover:shadow-md ${
                      isCompleted
                        ? 'border-dynamic-green/30 bg-dynamic-green/5'
                        : 'hover:bg-accent/5'
                    }`}
                  >
                    {/* Task Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">
                            {getCategoryIcon(task.category)}
                          </span>
                          <Input
                            placeholder="Task name"
                            value={task.name}
                            onChange={(e) =>
                              onUpdateTask(task.id, { name: e.target.value })
                            }
                            className={`h-auto border-none bg-transparent p-0 text-lg font-semibold focus-visible:ring-0 ${
                              isCompleted
                                ? 'text-muted-foreground line-through'
                                : ''
                            }`}
                          />
                          {/* Split Toggle Button */}
                          <div className="ml-2 flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1">
                                  <SplitIcon className="h-4 w-4 text-primary" />
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
                            <CheckCircleIcon className="h-5 w-5 text-dynamic-green" />
                          )}
                        </div>

                        {/* Progress Bar */}
                        {progress && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                Progress: {progress.completed.toFixed(1)}h /{' '}
                                {task.duration}h
                              </span>
                              <span
                                className={`font-medium ${isCompleted ? 'text-dynamic-green' : 'text-dynamic-blue'}`}
                              >
                                {Math.round(progressPercentage)}%
                              </span>
                            </div>
                            <Progress
                              value={progressPercentage}
                              className="h-2"
                            />
                            {progress.remaining > 0 && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <ClockIcon className="h-3 w-3" />
                                <span>
                                  {progress.remaining.toFixed(1)}h remaining
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tags */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={getCategoryColor(task.category)}>
                            {task.category}
                          </Badge>

                          {deadlineStatus && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge
                                  variant="outline"
                                  className={deadlineStatus.color}
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
                                  className="text-dynamic-purple"
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
                        className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Task Details */}
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
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
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
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
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
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
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          Category
                        </Label>
                        <Select
                          value={task.category}
                          onValueChange={(
                            value: 'work' | 'personal' | 'meeting'
                          ) => onUpdateTask(task.id, { category: value })}
                        >
                          <SelectTrigger className="text-sm">
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
                    </div>

                    {/* Deadline */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
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
                        className="text-sm"
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
              className="w-full"
              disabled={isScheduling}
            >
              {isScheduling ? (
                <>
                  <ClockIcon className="mr-2 h-4 w-4 animate-spin" />
                  Generating Schedule...
                </>
              ) : (
                <>
                  <CalendarIcon className="mr-2 h-4 w-4" />
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
