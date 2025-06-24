'use client';

import { scheduleTasks } from '@tuturuuu/ai/scheduling/algorithm';
import {
  defaultActiveHours,
  defaultTasks,
} from '@tuturuuu/ai/scheduling/default';
import type {
  ActiveHours,
  DateRange,
  Event,
  Log,
  Task,
  TemplateScenario,
} from '@tuturuuu/ai/scheduling/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  BrainIcon,
  CalendarIcon,
  ClockIcon,
  LockIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import dayjs from 'dayjs';
import { useState } from 'react';
import { AlgorithmInsights } from './components/AlgorithmInsights';
import { ScheduleDisplay } from './components/ScheduleDisplay';
import { TaskList } from './components/TaskList';
import { TaskModal } from './components/TaskModal';
import { TemplateScenarios } from './components/TemplateScenarios';

function SchedulerPage() {
  const [tasks, setTasks] = useState<Task[]>(defaultTasks);
  const [events, setEvents] = useState<Event[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [activeHours, setActiveHours] =
    useState<ActiveHours>(defaultActiveHours);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [lockedEvents, setLockedEvents] = useState<Event[]>([]);
  const [isLockedEventModalOpen, setIsLockedEventModalOpen] = useState(false);

  const loadTemplate = (template: TemplateScenario) => {
    setTasks(
      template.tasks.map((task) => ({
        ...task,
        id: `${task.id}-${Date.now()}`,
      }))
    );
    setEvents([]);
    setLogs([]);
    if (template.activeHours) {
      setActiveHours({ ...activeHours, ...template.activeHours });
    }
  };

  const clearAll = () => {
    setTasks([]);
    setEvents([]);
    setLogs([]);
  };

  const addTask = (taskData: Omit<Task, 'id' | 'events'>) => {
    const newTask: Task = {
      ...taskData,
      id: `task-${Date.now()}`,
      events: [],
    };
    setTasks([...tasks, newTask]);
  };

  const updateTask = (id: string, updatedTask: Partial<Task>) => {
    setTasks(
      tasks.map((task) => (task.id === id ? { ...task, ...updatedTask } : task))
    );
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter((task) => task.id !== id));
    // Also clear related events and logs
    setEvents(events.filter((event) => event.taskId !== id));
    setLogs([]);
  };

  const addLockedEvent = (
    eventData: Omit<Event, 'id' | 'locked' | 'taskId'>
  ) => {
    const newEvent: Event = {
      ...eventData,
      id: `locked-${Date.now()}`,
      locked: true,
      taskId: 'locked',
    };
    setLockedEvents([...lockedEvents, newEvent]);
  };

  const deleteLockedEvent = (id: string) => {
    setLockedEvents(lockedEvents.filter((event) => event.id !== id));
  };

  const handleSchedule = async () => {
    setIsScheduling(true);
    setTimeout(() => {
      const { events: scheduledEvents, logs: scheduleLogs } = scheduleTasks(
        tasks,
        activeHours,
        lockedEvents
      );
      setEvents(scheduledEvents);
      setLogs(scheduleLogs);
      setIsScheduling(false);
    }, 500);
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

  return (
    <TooltipProvider>
      <div className="relative flex min-h-screen flex-col gap-8 overflow-y-auto p-4 pt-16 md:p-8 md:pt-20 lg:p-12 lg:pt-20">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-dynamic-blue to-dynamic-purple text-white">
              <SparklesIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="bg-gradient-to-r from-dynamic-blue to-dynamic-purple bg-clip-text text-3xl font-bold text-transparent">
                AI Task Scheduler
              </h1>
              <p className="text-muted-foreground">
                Intelligently schedule your tasks with advanced splitting and
                optimization
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="tasks" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Tasks
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <ClockIcon className="h-4 w-4" />
              Schedule
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <BrainIcon className="h-4 w-4" />
              Insights
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="space-y-6">
            <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <TaskList
                  tasks={tasks}
                  events={events}
                  isScheduling={isScheduling}
                  onAddTask={() => setIsTaskModalOpen(true)}
                  onUpdateTask={updateTask}
                  onDeleteTask={deleteTask}
                  onSchedule={handleSchedule}
                />
                {/* Locked Events Section */}
                <div className="mt-8">
                  <Card className="border-0 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg dark:from-blue-950/20 dark:to-indigo-950/20">
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
                            <LockIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <CardTitle className="text-lg font-bold text-gray-900 dark:text-white">
                              Locked Events
                            </CardTitle>
                            <CardDescription className="text-sm">
                              Time blocks that cannot be rescheduled
                            </CardDescription>
                          </div>
                        </div>
                        <Button
                          onClick={() => setIsLockedEventModalOpen(true)}
                          size="sm"
                          className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg transition-all duration-200 hover:from-blue-600 hover:to-indigo-700"
                        >
                          <PlusIcon className="mr-2 h-4 w-4" />
                          Add Locked Event
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {lockedEvents.length === 0 ? (
                        <div className="py-8 text-center">
                          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
                            <LockIcon className="h-6 w-6 text-blue-500" />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            No locked events. Add time blocks that should not be
                            rescheduled.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {lockedEvents.map((event) => (
                            <div
                              key={event.id}
                              className="flex items-center gap-4 rounded-lg border border-blue-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md dark:border-blue-800 dark:bg-gray-900"
                            >
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
                                <LockIcon className="h-5 w-5" />
                              </div>
                              <div className="flex-1 space-y-1">
                                <h4 className="font-semibold text-gray-900 dark:text-white">
                                  {event.name}
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  {event.range.start.format(
                                    'MMM D, YYYY HH:mm'
                                  )}{' '}
                                  -{' '}
                                  {event.range.end.format('MMM D, YYYY HH:mm')}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteLockedEvent(event.id)}
                                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20"
                              >
                                <Trash2Icon className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
              <div>
                <TemplateScenarios
                  onLoadTemplate={loadTemplate}
                  onClearAll={clearAll}
                />
              </div>
            </div>
            {/* Locked Event Modal */}
            {isLockedEventModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="w-full max-w-md rounded-xl border-0 bg-white p-6 shadow-2xl dark:bg-gray-900">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
                      <LockIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        Add Locked Event
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Create a time block that cannot be rescheduled
                      </p>
                    </div>
                  </div>
                  <LockedEventForm
                    onAdd={(event) => {
                      addLockedEvent(event);
                      setIsLockedEventModalOpen(false);
                    }}
                    onCancel={() => setIsLockedEventModalOpen(false)}
                  />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="schedule" className="space-y-6">
            <ScheduleDisplay events={events} tasks={tasks} />
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            <AlgorithmInsights tasks={tasks} events={events} logs={logs} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* Active Hours Configuration */}
              <Card className="border-0 bg-white shadow-lg dark:bg-gray-900">
                <CardHeader className="pb-6">
                  <div className="space-y-2">
                    <CardTitle className="flex items-center gap-3 text-xl font-bold">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg">
                        <ClockIcon className="h-4 w-4" />
                      </div>
                      Active Hours
                    </CardTitle>
                    <CardDescription className="text-base">
                      Configure your available time ranges for different
                      activities
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {Object.entries(activeHours).map(
                    ([category, ranges]: [string, DateRange[]]) => (
                      <div key={category} className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`rounded-full px-4 py-2 text-sm font-bold ${getCategoryColor(
                              category as 'work' | 'personal' | 'meeting'
                            )}`}
                          >
                            {category.charAt(0).toUpperCase() +
                              category.slice(1)}
                          </div>
                        </div>
                        {ranges.map((range, index) => (
                          <div
                            key={range.start.toISOString()}
                            className="grid grid-cols-2 gap-4"
                          >
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                Start Time
                              </Label>
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
                                className="border-gray-200 focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                End Time
                              </Label>
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
                                className="border-gray-200 focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </CardContent>
              </Card>

              {/* Settings Overview */}
              <Card className="border-0 bg-white shadow-lg dark:bg-gray-900">
                <CardHeader className="pb-6">
                  <div className="space-y-2">
                    <CardTitle className="text-xl font-bold">
                      Scheduler Settings
                    </CardTitle>
                    <CardDescription className="text-base">
                      Current configuration and preferences
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-bold text-gray-900 dark:text-white">
                      Time Allocation
                    </h4>
                    <div className="space-y-3">
                      {Object.entries(activeHours).map(([category, ranges]) => {
                        const totalHours = ranges.reduce(
                          (sum: number, range: DateRange) =>
                            sum + range.end.diff(range.start, 'hour', true),
                          0
                        );
                        return (
                          <div
                            key={category}
                            className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-800"
                          >
                            <span className="font-medium text-gray-900 capitalize dark:text-white">
                              {category}
                            </span>
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                              {totalHours}h/day
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-gray-900 dark:text-white">
                      Algorithm Features
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-lg bg-green-50 p-3 dark:bg-green-950/20">
                        <div className="h-3 w-3 rounded-full bg-green-500"></div>
                        <span className="text-sm font-medium text-green-700 dark:text-green-300">
                          Task splitting based on min/max duration
                        </span>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/20">
                        <div className="h-3 w-3 rounded-full bg-blue-500"></div>
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                          Deadline-aware prioritization
                        </span>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg bg-orange-50 p-3 dark:bg-orange-950/20">
                        <div className="h-3 w-3 rounded-full bg-orange-500"></div>
                        <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                          Category-based time management
                        </span>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg bg-purple-50 p-3 dark:bg-purple-950/20">
                        <div className="h-3 w-3 rounded-full bg-purple-500"></div>
                        <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                          Intelligent conflict resolution
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Task Modal */}
        <TaskModal
          isOpen={isTaskModalOpen}
          onCloseAction={() => setIsTaskModalOpen(false)}
          onAddTaskAction={addTask}
        />
      </div>
    </TooltipProvider>
  );
}

function LockedEventForm({
  onAdd,
  onCancel,
}: {
  onAdd: (event: Omit<Event, 'id' | 'locked' | 'taskId'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [category, setCategory] = useState<'work' | 'personal' | 'meeting'>(
    'work'
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const start = dayjs(`${date}T${startTime}`);
    const end = dayjs(`${date}T${endTime}`);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
      setError('Invalid date or time');
      return;
    }
    setError(null);
    onAdd({
      name,
      range: { start, end },
      isPastDeadline: false,
      partNumber: undefined,
      totalParts: undefined,
      category,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Event Name
        </Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter event name"
          className="border-gray-200 focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Date
          </Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border-gray-200 focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400"
            required
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Category
          </Label>
          <Select
            value={category}
            onValueChange={(v) =>
              setCategory(v as 'work' | 'personal' | 'meeting')
            }
          >
            <SelectTrigger className="border-gray-200 focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="work">💼 Work</SelectItem>
              <SelectItem value="personal">🏠 Personal</SelectItem>
              <SelectItem value="meeting">👥 Meeting</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Start Time
          </Label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="border-gray-200 focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400"
            required
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            End Time
          </Label>
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="border-gray-200 focus:border-blue-500 dark:border-gray-700 dark:focus:border-blue-400"
            required
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg transition-all duration-200 hover:from-blue-600 hover:to-indigo-700"
        >
          Add Locked Event
        </Button>
      </div>
    </form>
  );
}

export default SchedulerPage;
