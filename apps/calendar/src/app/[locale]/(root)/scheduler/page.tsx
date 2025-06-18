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
  SettingsIcon,
  SparklesIcon,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
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

  const handleSchedule = async () => {
    setIsScheduling(true);
    // Add a small delay to show loading state
    setTimeout(() => {
      const { events: scheduledEvents, logs: scheduleLogs } = scheduleTasks(
        tasks,
        activeHours
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
              </div>
              <div>
                <TemplateScenarios
                  onLoadTemplate={loadTemplate}
                  onClearAll={clearAll}
                />
              </div>
            </div>
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
          onClose={() => setIsTaskModalOpen(false)}
          onAddTask={addTask}
        />
      </div>
    </TooltipProvider>
  );
}

export default SchedulerPage;
