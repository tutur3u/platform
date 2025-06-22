'use client';

import { AlgorithmInsights } from './components/AlgorithmInsights';
import { ScheduleDisplay } from './components/ScheduleDisplay';
import { TaskList } from './components/TaskList';
import { TaskModal } from './components/TaskModal';
import { TemplateScenarios } from './components/TemplateScenarios';
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
  SettingsIcon,
  SparklesIcon,
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
                  <div className="mb-2 flex items-center gap-2">
                    <LockIcon className="h-5 w-5 text-dynamic-blue" />
                    <span className="font-semibold">Locked Events</span>
                    <button
                      className="ml-auto rounded bg-dynamic-blue px-3 py-1 text-xs text-white transition hover:bg-dynamic-blue/80"
                      onClick={() => setIsLockedEventModalOpen(true)}
                    >
                      Add Locked Event
                    </button>
                  </div>
                  {lockedEvents.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No locked events
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {lockedEvents.map((event) => (
                        <li
                          key={event.id}
                          className="flex items-center gap-3 rounded border border-dynamic-blue/30 bg-dynamic-blue/5 px-3 py-2"
                        >
                          <LockIcon className="h-4 w-4 text-dynamic-blue" />
                          <span className="font-medium">{event.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {event.range.start.format('YYYY-MM-DD HH:mm')} -{' '}
                            {event.range.end.format('YYYY-MM-DD HH:mm')}
                          </span>
                          <button
                            className="ml-auto text-xs text-destructive hover:underline"
                            onClick={() => deleteLockedEvent(event.id)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
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
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                    <LockIcon className="h-5 w-5 text-dynamic-blue" /> Add
                    Locked Event
                  </h3>
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
            <ScheduleDisplay events={events} />
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            <AlgorithmInsights tasks={tasks} events={events} logs={logs} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Active Hours Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClockIcon className="h-5 w-5" />
                    Active Hours
                  </CardTitle>
                  <CardDescription>
                    Configure your available time ranges for different
                    activities
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {Object.entries(activeHours).map(
                    ([category, ranges]: [string, DateRange[]]) => (
                      <div key={category} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`rounded-full px-3 py-1 text-sm font-medium ${getCategoryColor(
                              category as 'work' | 'personal' | 'meeting'
                            )}`}
                          >
                            {category.charAt(0).toUpperCase() +
                              category.slice(1)}
                          </div>
                        </div>
                        {ranges.map((range, index) => (
                          <div key={index} className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label className="text-sm text-muted-foreground">
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
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm text-muted-foreground">
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
              <Card>
                <CardHeader>
                  <CardTitle>Scheduler Settings</CardTitle>
                  <CardDescription>
                    Current configuration and preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <h4 className="font-medium">Time Allocation</h4>
                    <div className="space-y-2 text-sm">
                      {Object.entries(activeHours).map(([category, ranges]) => {
                        const totalHours = ranges.reduce(
                          (sum: number, range: DateRange) =>
                            sum + range.end.diff(range.start, 'hour', true),
                          0
                        );
                        return (
                          <div key={category} className="flex justify-between">
                            <span className="capitalize">{category}</span>
                            <span className="font-medium">
                              {totalHours}h/day
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">Algorithm Features</h4>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-dynamic-green"></div>
                        <span>Task splitting based on min/max duration</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-dynamic-blue"></div>
                        <span>Deadline-aware prioritization</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-dynamic-orange"></div>
                        <span>Category-based time management</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-dynamic-purple"></div>
                        <span>Intelligent conflict resolution</span>
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Event name"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Category</Label>
          <Select
            value={category}
            onValueChange={(v) =>
              setCategory(v as 'work' | 'personal' | 'meeting')
            }
          >
            <SelectTrigger>
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
        <div>
          <Label>Start Time</Label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>End Time</Label>
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </div>
      </div>
      {error && <div className="text-sm text-destructive">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="bg-dynamic-blue text-white hover:bg-dynamic-blue/80"
        >
          Add
        </Button>
      </div>
    </form>
  );
}

export default SchedulerPage;
