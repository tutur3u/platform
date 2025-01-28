'use client';

import { Task, YearPlan } from '../../types';
import { MonthPicker } from '../MonthPicker';
import { MonthlyOverview } from '../overview/MonthlyOverview';
import { TaskList } from '../tasks/TaskList';
import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import { Progress } from '@repo/ui/components/ui/progress';
import { Separator } from '@repo/ui/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/ui/tabs';
import { format, isValid, isWithinInterval, parseISO } from 'date-fns';
import {
  AlertCircle,
  BarChart,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  Code,
  ExternalLink,
  ListTodo,
  Target,
  Timer,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

interface PlanViewProps {
  yearPlan: Partial<YearPlan>;
  isLoading: boolean;
  planDuration: number;
}

const taskStatusColors = {
  'not-started': 'bg-secondary',
  'in-progress': 'bg-blue-500',
  completed: 'bg-green-500',
  blocked: 'bg-destructive',
} as const;

const taskPriorityIcons: Record<string, React.ReactNode> = {
  high: <AlertCircle className="text-destructive h-4 w-4" />,
  medium: <Clock className="h-4 w-4 text-yellow-500" />,
  low: <Target className="h-4 w-4 text-green-500" />,
};

const formatDate = (dateString: string | undefined, formatStr: string) => {
  if (!dateString) return '';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) {
      console.warn('Invalid date:', dateString);
      return 'Invalid date';
    }
    return format(date, formatStr);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
};

export function PlanView({ yearPlan, isLoading }: PlanViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeView, setActiveView] = useState<string>('list');

  const getAllTasks = useCallback((yearPlan: YearPlan | undefined) => {
    if (!yearPlan?.quarters) return [];

    return yearPlan.quarters.flatMap(
      (quarter) =>
        quarter?.milestones?.flatMap(
          (milestone) =>
            milestone?.tasks?.map((task) => ({
              ...task,
              milestone: milestone.title,
              quarter: quarter.quarter,
              milestone_start_date: milestone.start_date,
              milestone_end_date: milestone.end_date,
              quarter_start_date: quarter.start_date,
              quarter_end_date: quarter.end_date,
              start_date: task.start_date || milestone.start_date,
              end_date: task.end_date || milestone.end_date,
            })) ?? []
        ) ?? []
    );
  }, []);

  const getTasksForDate = useCallback(
    (date: Date) => {
      const allTasks = getAllTasks(yearPlan as YearPlan | undefined);

      return allTasks.filter((task) => {
        if (!task?.start_date || !task?.end_date) {
          console.warn('Task missing dates:', task?.title);
          return false;
        }

        try {
          const taskStart = parseISO(task.start_date);
          const taskEnd = parseISO(task.end_date);

          if (!isValid(taskStart) || !isValid(taskEnd)) {
            console.warn('Invalid date format for task:', task.title);
            return false;
          }

          return isWithinInterval(date, { start: taskStart, end: taskEnd });
        } catch (error) {
          console.error('Error parsing dates for task:', task.title, error);
          return false;
        }
      });
    },
    [getAllTasks, yearPlan]
  );

  const getTasksForQuarter = useCallback(
    (quarterNumber: number) => {
      const allTasks = getAllTasks(yearPlan as YearPlan | undefined);
      return allTasks.filter((task) => task.quarter === quarterNumber);
    },
    [getAllTasks, yearPlan]
  );

  const stats = useMemo(() => {
    const allTasks = getAllTasks(yearPlan as YearPlan | undefined);
    const totalTasks = allTasks.length;
    const today = new Date();

    const tasksThisMonth = allTasks.filter((task) => {
      if (!task?.start_date || !task?.end_date) return false;

      try {
        const taskStart = parseISO(task.start_date);
        const taskEnd = parseISO(task.end_date);

        if (!isValid(taskStart) || !isValid(taskEnd)) {
          return false;
        }

        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        return (
          isWithinInterval(monthStart, { start: taskStart, end: taskEnd }) ||
          isWithinInterval(monthEnd, { start: taskStart, end: taskEnd }) ||
          isWithinInterval(taskStart, { start: monthStart, end: monthEnd })
        );
      } catch (error) {
        console.error('Error parsing dates for task:', task.title, error);
        return false;
      }
    });

    const highPriorityTasks = allTasks.filter(
      (task) => task.priority === 'high'
    );
    const completedTasks = allTasks.filter(
      (task) => task.status === 'completed'
    );
    const totalEstimatedHours = allTasks.reduce(
      (sum, task) => sum + (task.estimatedHours ?? 0),
      0
    );

    let progress = 0;
    if (yearPlan?.start_date && yearPlan?.end_date) {
      try {
        const startDate = parseISO(yearPlan.start_date);
        const endDate = parseISO(yearPlan.end_date);

        if (isValid(startDate) && isValid(endDate)) {
          const totalDuration = endDate.getTime() - startDate.getTime();
          const elapsed = today.getTime() - startDate.getTime();
          progress = Math.round((elapsed / totalDuration) * 100);
        }
      } catch (error) {
        console.error('Error calculating progress:', error);
      }
    }

    return {
      totalTasks,
      tasksThisMonth: tasksThisMonth.length,
      highPriorityTasks: highPriorityTasks.length,
      completedTasks: completedTasks.length,
      progress: Math.max(0, Math.min(100, progress)),
      estimatedHours: totalEstimatedHours,
      completion: Math.round((completedTasks.length / totalTasks) * 100) || 0,
    };
  }, [getAllTasks, yearPlan]);

  const renderMetadata = () => {
    if (!yearPlan?.metadata) return null;

    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Learning Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Skill Level
                </span>
                <Badge variant="secondary">
                  {yearPlan.metadata.skillLevel}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Weekly Hours
                </span>
                <Badge variant="secondary">
                  {yearPlan.metadata.weeklyCommitment}h
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Total Hours
                </span>
                <Badge variant="secondary">
                  {yearPlan.metadata.totalHours}h
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {yearPlan.metadata.preferredSchedule && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {yearPlan.metadata.preferredSchedule.weekdays && (
                    <Badge variant="outline">Weekdays</Badge>
                  )}
                  {yearPlan.metadata.preferredSchedule.weekends && (
                    <Badge variant="outline">Weekends</Badge>
                  )}
                  {yearPlan.metadata.preferredSchedule.timeOfDay && (
                    <Badge variant="outline">
                      {yearPlan.metadata.preferredSchedule.timeOfDay}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Prerequisites Card */}
        {yearPlan.metadata.prerequisites &&
          yearPlan.metadata.prerequisites.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Prerequisites
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {yearPlan.metadata.prerequisites.map(
                    (prereq: string, idx: number) => (
                      <Badge
                        key={`prereq-${idx}`}
                        variant="outline"
                        className="mr-2"
                      >
                        {prereq}
                      </Badge>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          )}
      </div>
    );
  };

  const renderTaskCard = (task: Task, uniqueKey: string) => {
    return (
      <div
        key={uniqueKey}
        className="bg-card/50 flex items-start justify-between gap-4 rounded-md border p-4"
      >
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <div className="mt-1">{taskPriorityIcons[task.priority]}</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{task.title}</span>
                <Badge
                  variant={
                    task.priority === 'high'
                      ? 'destructive'
                      : task.priority === 'medium'
                        ? 'default'
                        : 'secondary'
                  }
                  className="text-xs"
                >
                  {task.priority}
                </Badge>
                {task.status && (
                  <div
                    className={`h-2 w-2 rounded-full ${
                      taskStatusColors[
                        task.status as keyof typeof taskStatusColors
                      ]
                    }`}
                  />
                )}
              </div>
              {task.description && (
                <p className="text-muted-foreground text-sm">
                  {task.description}
                </p>
              )}
              <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-4 text-xs">
                {task.estimatedHours && (
                  <div className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    {task.estimatedHours} hours
                  </div>
                )}
                {task.start_date && task.end_date && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(task.start_date, 'MMM d')} -{' '}
                    {formatDate(task.end_date, 'MMM d, yyyy')}
                  </div>
                )}
              </div>
              {task.resources && task.resources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {task.resources.map((resource, resourceIdx) => (
                    <Button
                      key={`resource-${uniqueKey}-${resourceIdx}`}
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 text-xs"
                      asChild
                    >
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {resource.title}
                      </a>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStats = () => {
    if (!yearPlan) return null;

    return (
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Target className="text-primary h-4 w-4" />
              <div className="flex flex-col">
                <span className="text-2xl font-bold">{stats.totalTasks}</span>
                <span className="text-muted-foreground text-xs">
                  Total Tasks
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="text-primary h-4 w-4" />
              <div className="flex flex-col">
                <span className="text-2xl font-bold">
                  {stats.tasksThisMonth}
                </span>
                <span className="text-muted-foreground text-xs">
                  Tasks This Month
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Timer className="text-primary h-4 w-4" />
              <div className="flex flex-col">
                <span className="text-2xl font-bold">
                  {stats.estimatedHours}h
                </span>
                <span className="text-muted-foreground text-xs">
                  Total Hours
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart className="text-primary h-4 w-4" />
                  <span className="text-sm font-medium">Completion</span>
                </div>
                <span className="text-sm font-medium">{stats.completion}%</span>
              </div>
              <Progress value={stats.completion} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderCalendarView = () => {
    if (!selectedDate) return null;
    const tasks = getTasksForDate(selectedDate);

    return (
      <div className="space-y-6">
        {renderStats()}
        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="text-primary h-5 w-5" />
                  Month Selection
                </CardTitle>
                <CardDescription>
                  Navigate through months to view your tasks and milestones
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MonthPicker
                  value={selectedDate}
                  onChange={setSelectedDate}
                  minDate={
                    yearPlan?.start_date
                      ? parseISO(yearPlan.start_date)
                      : undefined
                  }
                  maxDate={
                    yearPlan?.end_date ? parseISO(yearPlan.end_date) : undefined
                  }
                />
              </CardContent>
            </Card>

            <MonthlyOverview
              tasks={tasks}
              selectedDate={selectedDate}
              yearPlan={yearPlan as YearPlan | undefined}
            />
          </div>

          <TaskList tasks={tasks} selectedDate={selectedDate} />
        </div>
      </div>
    );
  };

  const renderYearPlan = () => {
    return (
      <div className="relative space-y-8">
        {isLoading && (
          <div className="absolute top-4 right-4">
            <div className="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        )}

        {renderStats()}

        <Separator className="my-6" />

        {/* Overview Section */}
        {yearPlan?.overview ? (
          <div className="bg-card rounded-lg border p-6">
            <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold">
              <Target className="text-primary h-5 w-5" />
              Overview
            </h3>
            <p className="text-muted-foreground">{yearPlan.overview}</p>
          </div>
        ) : isLoading ? (
          <div className="bg-muted h-20 animate-pulse rounded-lg" />
        ) : null}

        {/* Quarters Section */}
        {yearPlan?.quarters?.map((quarter, quarterIdx) => {
          if (!quarter) return null;
          const quarterTasks = getTasksForQuarter(quarter.quarter ?? 0);
          const isCurrentQuarter =
            Math.ceil(new Date().getMonth() / 3) === quarter.quarter;

          return (
            <div key={`quarter-${quarterIdx}`} className="space-y-6">
              <div className="bg-card rounded-lg border p-6">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <CheckCircle2 className="text-primary h-5 w-5" />Q
                  {quarter.quarter}: {quarter.focus}
                  {isCurrentQuarter && (
                    <Badge variant="secondary" className="ml-2">
                      Current Quarter
                    </Badge>
                  )}
                </h3>

                <div className="space-y-4">
                  {quarter.milestones?.map((milestone, milestoneIdx) => {
                    if (!milestone) return null;
                    const milestoneTasks = quarterTasks.filter(
                      (task) => task.milestone === milestone.title
                    );

                    return (
                      <Card
                        key={`milestone-${quarterIdx}-${milestoneIdx}`}
                        className="border-muted/50"
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">
                              {milestone.title}
                            </CardTitle>
                            {milestone.start_date && milestone.end_date ? (
                              <Badge variant="outline" className="font-normal">
                                {formatDate(milestone.start_date, 'MMM d')} -{' '}
                                {formatDate(milestone.end_date, 'MMM d, yyyy')}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="font-normal">
                                No dates set
                              </Badge>
                            )}
                          </div>
                          {milestone.description && (
                            <CardDescription>
                              {milestone.description}
                            </CardDescription>
                          )}
                        </CardHeader>

                        <CardContent className="space-y-2">
                          {milestoneTasks.map((task, taskIdx) =>
                            renderTaskCard(
                              task,
                              `${quarterIdx}-${milestoneIdx}-${taskIdx}`
                            )
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Recommendations Section */}
        {yearPlan?.recommendations && yearPlan.recommendations.length > 0 && (
          <div className="bg-card rounded-lg border p-6">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Target className="text-primary h-5 w-5" />
              Key Recommendations
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {yearPlan.recommendations.map((recommendation, idx) => (
                <li
                  key={`recommendation-${idx}`}
                  className="bg-card/50 text-muted-foreground flex items-start gap-2 rounded-md border p-3 text-sm"
                >
                  <span className="text-primary mt-1 text-sm">•</span>
                  {recommendation}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Loading placeholders */}
        {isLoading && !yearPlan?.quarters?.length && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={`loading-${idx}`}
                className="bg-muted h-32 animate-pulse rounded-lg"
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderJsonView = () => {
    return (
      <div className="relative space-y-4">
        {isLoading && (
          <div className="absolute top-4 right-4">
            <div className="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        )}

        <pre className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap">
          {JSON.stringify(yearPlan, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle>Your Year Plan</CardTitle>
        <CardDescription>
          View and track your personalized year plan
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {renderMetadata()}

        <Tabs value={activeView} onValueChange={setActiveView}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="list" className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              List View
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Calendar View
            </TabsTrigger>
            <TabsTrigger value="json" className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              JSON
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-6">
            {renderYearPlan()}
          </TabsContent>

          <TabsContent value="calendar" className="mt-6">
            {renderCalendarView()}
          </TabsContent>

          <TabsContent value="json" className="mt-6">
            {renderJsonView()}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
