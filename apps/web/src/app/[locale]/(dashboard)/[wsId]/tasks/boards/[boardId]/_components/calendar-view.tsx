import { TaskActions } from '../task-actions';
import { getTasks } from '@/lib/task-helper';
import { createClient } from '@ncthub/supabase/next/client';
import { Task } from '@ncthub/types/primitives/TaskBoard';
import { Button } from '@ncthub/ui/button';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@ncthub/ui/hover-card';
import { Flag, MoreHorizontal } from '@ncthub/ui/icons';
import { cn } from '@ncthub/utils/format';
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isEqual,
  isSameMonth,
  isToday,
  startOfMonth,
} from 'date-fns';
import { useEffect, useState } from 'react';

interface Props {
  boardId: string;
  tasks: Task[];
  isLoading: boolean;
}

export function CalendarView({
  boardId,
  tasks: loadedTasks,
  isLoading: loadedIsLoading,
}: Props) {
  const [tasks, setTasks] = useState<Task[]>(loadedTasks);
  const [, setIsLoading] = useState(loadedIsLoading);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    // Initial data fetch
    async function loadData() {
      try {
        setIsLoading(true);
        const tasks = await getTasks(supabase, boardId);
        if (mounted) setTasks(tasks);
      } catch (error) {
        console.error('Failed to load tasks:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    // Set up real-time subscriptions
    const tasksSubscription = supabase
      .channel('tasks-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        async () => {
          const tasks = await getTasks(supabase, boardId);
          if (mounted) setTasks(tasks);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignees',
        },
        async () => {
          const tasks = await getTasks(supabase, boardId);
          if (mounted) setTasks(tasks);
        }
      )
      .subscribe();

    loadData();

    return () => {
      mounted = false;
      tasksSubscription.unsubscribe();
    };
  }, [boardId]);

  const start = startOfMonth(selectedDate);
  const end = endOfMonth(selectedDate);
  const days = eachDayOfInterval({ start, end });

  const firstDayOfMonth = getDay(start);
  const daysFromPreviousMonth = Array.from(
    { length: firstDayOfMonth },
    (_, i) => addDays(start, -firstDayOfMonth + i)
  );

  const allDays = [...daysFromPreviousMonth, ...days];
  const weeks = Math.ceil(allDays.length / 7);
  const remainingDays = weeks * 7 - allDays.length;
  const daysFromNextMonth = Array.from({ length: remainingDays }, (_, i) =>
    addDays(end, i + 1)
  );

  const calendar = [...allDays, ...daysFromNextMonth];

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">
            {format(selectedDate, 'MMMM yyyy')}
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSelectedDate((date) => startOfMonth(addDays(date, -30)))
              }
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSelectedDate((date) => startOfMonth(addDays(date, 30)))
              }
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border">
        <div className="grid grid-cols-7 gap-px border-b bg-muted">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div
              key={day}
              className="bg-background p-2 text-center text-sm font-medium"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-muted">
          {calendar.map((date) => {
            const dayTasks = tasks.filter(
              (task) =>
                (task.start_date && isEqual(new Date(task.start_date), date)) ||
                (task.end_date && isEqual(new Date(task.end_date), date))
            );

            return (
              <div
                key={date.toString()}
                className={cn(
                  'min-h-[120px] bg-background p-2',
                  !isSameMonth(date, selectedDate) &&
                    'bg-muted/50 text-muted-foreground'
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn('text-sm', {
                      'font-bold text-primary': isToday(date),
                    })}
                  >
                    {format(date, 'd')}
                  </span>
                </div>

                <div className="mt-1 space-y-1">
                  {dayTasks.slice(0, 3).map((task) => (
                    <HoverCard key={task.id}>
                      <HoverCardTrigger asChild>
                        <Button
                          variant="ghost"
                          className={cn(
                            'h-auto w-full justify-start gap-1 p-1 text-xs',
                            task.archived &&
                              'text-muted-foreground line-through'
                          )}
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          {task.priority && (
                            <Flag
                              className={cn('h-3 w-3', {
                                'fill-destructive stroke-destructive':
                                  task.priority === 1,
                                'fill-yellow-500 stroke-yellow-500':
                                  task.priority === 2,
                                'fill-green-500 stroke-green-500':
                                  task.priority === 3,
                              })}
                            />
                          )}
                          <span className="line-clamp-1">{task.name}</span>
                        </Button>
                      </HoverCardTrigger>
                      <HoverCardContent side="right" className="w-80">
                        <div className="space-y-2">
                          <h4 className="font-medium">{task.name}</h4>
                          {task.description && (
                            <p className="text-sm text-muted-foreground">
                              {task.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {task.start_date && (
                              <span>
                                Starts:{' '}
                                {format(new Date(task.start_date), 'PPP')}
                              </span>
                            )}
                            {task.end_date && (
                              <span>
                                Due: {format(new Date(task.end_date), 'PPP')}
                              </span>
                            )}
                          </div>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  ))}
                  {dayTasks.length > 3 && (
                    <Button
                      variant="ghost"
                      className="h-auto w-full justify-start p-1 text-xs"
                    >
                      <MoreHorizontal className="h-3 w-3" />
                      <span>
                        {dayTasks.length - 3} more task
                        {dayTasks.length - 3 === 1 ? '' : 's'}
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedTaskId && (
        <TaskActions
          taskId={selectedTaskId}
          taskName={tasks.find((t) => t.id === selectedTaskId)?.name || ''}
          taskDescription={
            tasks.find((t) => t.id === selectedTaskId)?.description || null
          }
          startDate={
            tasks.find((t) => t.id === selectedTaskId)?.start_date || null
          }
          endDate={tasks.find((t) => t.id === selectedTaskId)?.end_date || null}
          priority={
            tasks.find((t) => t.id === selectedTaskId)?.priority || null
          }
          archived={
            tasks.find((t) => t.id === selectedTaskId)?.archived || false
          }
          assignees={
            tasks.find((t) => t.id === selectedTaskId)?.assignees || []
          }
          onUpdate={() => {
            setSelectedTaskId(null);
            const supabase = createClient();
            getTasks(supabase, boardId).then(setTasks);
          }}
          open={true}
          onOpenChange={(open) => !open && setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
