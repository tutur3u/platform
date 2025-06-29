'use client';

import { useState, useMemo } from 'react';
import type { Task } from '@tuturuuu/types/primitives/TaskBoard';

import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Users,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  isSameMonth,
  parseISO,
  isValid,
} from 'date-fns';

export interface CalendarViewProps {
  tasks: Task[];
  onTaskSelect?: (taskId: string) => void;
  className?: string;
}

type CalendarMode = 'week' | 'month';

const PRIORITY_COLORS = {
  1: 'border-red-200 bg-red-50 text-red-700',
  2: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  3: 'border-green-200 bg-green-50 text-green-700',
} as const;

function formatTaskDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const date = parseISO(dateStr);
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
}

interface TaskItemProps {
  task: Task;
  onSelect?: (taskId: string) => void;
  compact?: boolean;
}

const TaskItem = ({ task, onSelect, compact = false }: TaskItemProps) => {
  const priority = task.priority as keyof typeof PRIORITY_COLORS;
  const priorityClass = priority ? PRIORITY_COLORS[priority] : 'border-gray-200 bg-gray-50 text-gray-700';

  return (
    <div
      className={cn(
        'group cursor-pointer rounded-md border p-2 transition-all hover:shadow-sm',
        priorityClass,
        compact && 'p-1 text-xs'
      )}
      onClick={() => onSelect?.(task.id)}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h4 className={cn(
            'font-medium truncate',
            compact ? 'text-xs' : 'text-sm'
          )}>
            {task.name}
          </h4>
          {!compact && task.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}
          <div className={cn(
            'flex items-center gap-2 mt-1',
            compact ? 'text-xs' : 'text-xs'
          )}>
            {task.priority && (
              <div className="flex items-center gap-1">
                <Flag className="h-3 w-3" />
                <span>
                  {task.priority === 1 ? 'High' : task.priority === 2 ? 'Med' : 'Low'}
                </span>
              </div>
            )}
            {task.assignees && task.assignees.length > 0 && (
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span>{task.assignees.length}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export function CalendarView({ tasks, onTaskSelect, className }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [mode, setMode] = useState<CalendarMode>('month');

  // Calculate date range
  const dateRange = useMemo(() => {
    if (mode === 'week') {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }), // Monday
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      };
    } else {
      return {
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      };
    }
  }, [currentDate, mode]);

  // Get all days in the current period
  const days = useMemo(() => {
    return eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
  }, [dateRange]);

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const groups: Record<string, Task[]> = {};

    tasks.forEach(task => {
      // Check both start_date and end_date
      const startDate = formatTaskDate(task.start_date);
      const endDate = formatTaskDate(task.end_date);

      days.forEach(day => {
        const dayKey = format(day, 'yyyy-MM-dd');
        
        // Include task if it starts, ends, or spans this day
        let includeTask = false;
        
        if (startDate && isSameDay(day, startDate)) {
          includeTask = true;
        }
        if (endDate && isSameDay(day, endDate)) {
          includeTask = true;
        }
        if (startDate && endDate && day >= startDate && day <= endDate) {
          includeTask = true;
        }
        if (!startDate && !endDate) {
          // Include tasks without dates in today's column
          includeTask = isToday(day);
        }

        if (includeTask) {
          if (!groups[dayKey]) {
            groups[dayKey] = [];
          }
          groups[dayKey].push(task);
        }
      });
    });

    return groups;
  }, [tasks, days]);

  const handlePrevious = () => {
    if (mode === 'week') {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const handleNext = () => {
    if (mode === 'week') {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header Controls */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">
            {mode === 'week' 
              ? `Week of ${format(dateRange.start, 'MMM d, yyyy')}`
              : format(currentDate, 'MMMM yyyy')
            }
          </h2>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={handlePrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={mode} onValueChange={(value: CalendarMode) => setMode(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Week View</SelectItem>
              <SelectItem value="month">Month View</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto p-4">
        {mode === 'week' ? (
          <div className="grid grid-cols-7 gap-4 h-full">
            {days.map(day => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const dayTasks = tasksByDate[dayKey] || [];
              const isCurrentMonth = isSameMonth(day, currentDate);

              return (
                <Card key={dayKey} className={cn(
                  'flex flex-col',
                  !isCurrentMonth && 'opacity-50',
                  isToday(day) && 'ring-2 ring-blue-500'
                )}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      <div className="flex items-center justify-between">
                        <span>{format(day, 'EEE')}</span>
                        <span className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                          isToday(day) && 'bg-blue-500 text-white'
                        )}>
                          {format(day, 'd')}
                        </span>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-2 p-3 pt-0">
                    {dayTasks.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No tasks
                      </div>
                    ) : (
                      dayTasks.map(task => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          onSelect={onTaskSelect}

                          compact={true}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {/* Day headers */}
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="p-2 text-center font-medium text-sm text-muted-foreground">
                {day}
              </div>
            ))}
            
            {/* Calendar days */}
            {days.map(day => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const dayTasks = tasksByDate[dayKey] || [];
              const isCurrentMonth = isSameMonth(day, currentDate);

              return (
                <div
                  key={dayKey}
                  className={cn(
                    'min-h-[120px] border rounded-lg p-2 space-y-1',
                    !isCurrentMonth && 'opacity-50 bg-muted/30',
                    isToday(day) && 'ring-2 ring-blue-500 bg-blue-50/50'
                  )}
                >
                  <div className="text-sm font-medium">
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {dayTasks.slice(0, 3).map(task => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onSelect={onTaskSelect}
                        compact={true}
                      />
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="text-xs text-muted-foreground text-center">
                        +{dayTasks.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="border-t p-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>{tasks.length} total tasks</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>
                {Object.values(tasksByDate).reduce((acc, tasks) => acc + tasks.length, 0)} scheduled
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded border-red-200 bg-red-50" />
              <span>High Priority</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded border-yellow-200 bg-yellow-50" />
              <span>Medium Priority</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded border-green-200 bg-green-50" />
              <span>Low Priority</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 