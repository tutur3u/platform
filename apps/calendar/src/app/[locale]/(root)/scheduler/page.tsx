'use client';

import {
  ActiveHours,
  type DateRange,
  Event,
  Log,
  Task,
  defaultActiveHours,
  defaultTasks,
  scheduleTasks,
} from '@tuturuuu/ai/scheduling/algorithm';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import dayjs from 'dayjs';
import { AlertTriangleIcon, InfoIcon, XCircleIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useMemo } from 'react';

function SchedulerPage() {
  const [tasks, setTasks] = useState<Task[]>(defaultTasks);
  const [events, setEvents] = useState<Event[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [activeHours, setActiveHours] =
    useState<ActiveHours>(defaultActiveHours);

  // States for the new task form
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState(1);
  const [newTaskDeadline, setNewTaskDeadline] = useState('');

  const addTask = () => {
    if (!newTaskName.trim() || newTaskDuration <= 0) return;
    const newTask: Task = {
      id: `task-${Date.now()}`,
      name: newTaskName,
      duration: newTaskDuration,
      deadline: newTaskDeadline ? dayjs(newTaskDeadline) : undefined,
      events: [],
    };
    setTasks([...tasks, newTask]);
    setNewTaskName('');
    setNewTaskDuration(1);
    setNewTaskDeadline('');
  };

  const updateTask = (id: string, updatedTask: Partial<Task>) => {
    setTasks(
      tasks.map((task) => (task.id === id ? { ...task, ...updatedTask } : task))
    );
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter((task) => task.id !== id));
  };

  const handleSchedule = () => {
    const { events: scheduledEvents, logs: scheduleLogs } = scheduleTasks(
      tasks,
      activeHours
    );
    setEvents(scheduledEvents);
    setLogs(scheduleLogs);
  };

  const handleActiveHoursChange = (
    category: keyof ActiveHours,
    index: number,
    field: 'start' | 'end',
    value: string
  ) => {
    const newActiveHours = { ...activeHours };
    const [hour, minute] = value.split(':').map(Number);
    newActiveHours[category][index][field] = dayjs().hour(hour).minute(minute);
    setActiveHours(newActiveHours);
  };

  const groupedEvents = useMemo(() => {
    return events.reduce(
      (acc, event) => {
        const date = event.range.start.format('YYYY-MM-DD');
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(event);
        return acc;
      },
      {} as Record<string, Event[]>
    );
  }, [events]);

  return (
    <div className="relative flex min-h-screen flex-col gap-8 overflow-y-auto p-4 pt-16 md:p-8 md:pt-20 lg:p-12 lg:pt-20">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 xl:grid-cols-3">
        {/* Column 1: Configuration */}
        <div className="flex flex-col gap-8">
          {/* Active Hours Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Active Hours</CardTitle>
              <CardDescription>
                Set your available time ranges for scheduling.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {Object.entries(activeHours).map(
                ([category, ranges]: [string, DateRange[]]) => (
                  <div key={category}>
                    <h3 className="mb-2 text-lg font-medium capitalize">
                      {category}
                    </h3>
                    {ranges.map((range, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={range.start.format('HH:mm')}
                          onChange={(e) =>
                            handleActiveHoursChange(
                              category as keyof ActiveHours,
                              index,
                              'start',
                              e.target.value
                            )
                          }
                        />
                        <span>-</span>
                        <Input
                          type="time"
                          value={range.end.format('HH:mm')}
                          onChange={(e) =>
                            handleActiveHoursChange(
                              category as keyof ActiveHours,
                              index,
                              'end',
                              e.target.value
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                )
              )}
            </CardContent>
          </Card>

          {/* Task Creation Form */}
          <Card>
            <CardHeader>
              <CardTitle>Create a new task</CardTitle>
              <CardDescription>
                Add tasks with their duration and an optional deadline.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="space-y-1">
                <Label htmlFor="task-name">Name</Label>
                <Input
                  id="task-name"
                  placeholder="e.g., Design the new logo"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="task-duration">Duration (hours)</Label>
                <Input
                  id="task-duration"
                  type="number"
                  value={newTaskDuration}
                  min={1}
                  onChange={(e) =>
                    setNewTaskDuration(parseInt(e.target.value, 10))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="task-deadline">Deadline (Optional)</Label>
                <Input
                  id="task-deadline"
                  type="datetime-local"
                  value={newTaskDeadline}
                  onChange={(e) => setNewTaskDeadline(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={addTask} className="w-full">
                Add Task
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Column 2: Task List and Scheduling */}
        <div className="flex flex-col gap-8">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle>Task List</CardTitle>
              <CardDescription>
                Your current list of tasks to be scheduled. Click schedule when
                ready.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="flex flex-col gap-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-4 rounded-md border p-2"
                  >
                    <Input
                      className="border-none"
                      value={task.name}
                      onChange={(e) =>
                        updateTask(task.id, { name: e.target.value })
                      }
                    />
                    <Input
                      className="w-24 border-none"
                      type="number"
                      value={task.duration}
                      min={1}
                      onChange={(e) =>
                        updateTask(task.id, {
                          duration: parseInt(e.target.value, 10),
                        })
                      }
                    />
                    <Input
                      className="border-none"
                      type="datetime-local"
                      value={
                        task.deadline
                          ? task.deadline.format('YYYY-MM-DDTHH:mm')
                          : ''
                      }
                      onChange={(e) =>
                        updateTask(task.id, {
                          deadline: e.target.value
                            ? dayjs(e.target.value)
                            : undefined,
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteTask(task.id)}
                    >
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSchedule} size="lg" className="w-full">
                Schedule My Day
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Column 3: Schedule and Logs */}
        <div className="flex flex-col gap-8">
          {/* Scheduled Events */}
          {events.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Your Scheduled Day</CardTitle>
                <CardDescription>
                  Here is your optimized schedule.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {Object.entries(groupedEvents).map(([date, dailyEvents]) => (
                  <div key={date} className="mb-4">
                    <h3 className="mb-2 font-semibold">
                      {dayjs(date).format('dddd, MMMM D')}
                    </h3>
                    <ul className="list-disc space-y-2 pl-5">
                      {dailyEvents.map((event) => (
                        <li key={event.id} className="flex items-center gap-2">
                          {event.isPastDeadline && (
                            <AlertTriangleIcon className="h-4 w-4 text-yellow-500" />
                          )}
                          <span className="font-semibold">{event.name}</span>:{' '}
                          {event.range.start.format('HH:mm')} -{' '}
                          {event.range.end.format('HH:mm')}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Logs</CardTitle>
                <CardDescription>
                  Warnings and errors from the scheduling process.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {logs.map((log, index) => (
                  <Alert
                    key={index}
                    variant={log.type === 'error' ? 'destructive' : 'default'}
                  >
                    {log.type === 'warning' && <InfoIcon className="h-4 w-4" />}
                    {log.type === 'error' && (
                      <XCircleIcon className="h-4 w-4" />
                    )}
                    <AlertTitle>
                      {log.type.charAt(0).toUpperCase() + log.type.slice(1)}
                    </AlertTitle>
                    <AlertDescription>{log.message}</AlertDescription>
                  </Alert>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default SchedulerPage;
