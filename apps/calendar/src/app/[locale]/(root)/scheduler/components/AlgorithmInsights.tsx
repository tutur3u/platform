'use client';

import type { Event, Log, Task } from '@tuturuuu/ai/scheduling/types';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  BrainIcon,
  CheckCircleIcon,
  InfoIcon,
  LayersIcon,
  TargetIcon,
  TrendingUpIcon,
  XCircleIcon,
  ZapIcon,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { useMemo } from 'react';

interface AlgorithmInsightsProps {
  tasks: Task[];
  events: Event[];
  logs: Log[];
}

interface SchedulingMetrics {
  totalTasks: number;
  scheduledTasks: number;
  totalDuration: number;
  scheduledDuration: number;
  splitTasks: number;
  deadlinesMet: number;
  deadlinesMissed: number;
  categoryDistribution: Record<string, number>;
  averageTaskSize: number;
  largestGap: number;
  utilizationRate: number;
}

const getCategoryColor = (category: string) => {
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

export function AlgorithmInsights({
  tasks,
  events,
  logs,
}: AlgorithmInsightsProps) {
  const metrics = useMemo((): SchedulingMetrics => {
    const scheduledTaskIds = new Set(events.map((e) => e.taskId));
    const scheduledTasks = tasks.filter((t) => scheduledTaskIds.has(t.id));

    const totalDuration = tasks.reduce((sum, task) => sum + task.duration, 0);
    const scheduledDuration = events.reduce(
      (sum, event) =>
        sum + event.range.end.diff(event.range.start, 'hour', true),
      0
    );

    const splitTasks = new Set(
      events
        .filter((e) => e.partNumber && e.partNumber > 1)
        .map((e) => e.taskId)
    ).size;

    let deadlinesMet = 0;
    let deadlinesMissed = 0;

    tasks.forEach((task) => {
      if (task.deadline) {
        const taskEvents = events.filter((e) => e.taskId === task.id);
        const lastEvent = taskEvents.sort((a, b) =>
          b.range.end.diff(a.range.end)
        )[0];

        if (lastEvent) {
          if (lastEvent.range.end.isAfter(task.deadline)) {
            deadlinesMissed++;
          } else {
            deadlinesMet++;
          }
        }
      }
    });

    const categoryDistribution = tasks.reduce(
      (acc, task) => {
        acc[task.category] = (acc[task.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const averageTaskSize = totalDuration / tasks.length || 0;

    // Calculate utilization rate (simplified)
    const workingHours = 8; // Assume 8-hour work day
    const utilizationRate = Math.min(
      (scheduledDuration / workingHours) * 100,
      100
    );

    return {
      totalTasks: tasks.length,
      scheduledTasks: scheduledTasks.length,
      totalDuration,
      scheduledDuration,
      splitTasks,
      deadlinesMet,
      deadlinesMissed,
      categoryDistribution,
      averageTaskSize,
      largestGap: 0, // TODO: Calculate actual gaps
      utilizationRate,
    };
  }, [tasks, events]);

  const algorithmConsiderations = useMemo(() => {
    const considerations = [];

    // Deadline prioritization
    const tasksWithDeadlines = tasks.filter((t) => t.deadline).length;
    if (tasksWithDeadlines > 0) {
      considerations.push({
        icon: TargetIcon,
        title: 'Deadline Prioritization',
        description: `${tasksWithDeadlines} tasks have deadlines. Algorithm prioritizes these tasks based on urgency.`,
        impact: 'high',
      });
    }

    // Task splitting analysis
    const splittableTasks = tasks.filter(
      (t) => t.maxDuration < t.duration
    ).length;
    if (splittableTasks > 0) {
      considerations.push({
        icon: ZapIcon,
        title: 'Task Splitting Strategy',
        description: `${splittableTasks} tasks can be split. Algorithm balances between focus time and flexibility.`,
        impact: 'medium',
      });
    }

    // Category time management
    const categories = Object.keys(metrics.categoryDistribution);
    if (categories.length > 1) {
      considerations.push({
        icon: LayersIcon,
        title: 'Category-Based Scheduling',
        description: `Tasks span ${categories.length} categories. Each category respects its specific time constraints.`,
        impact: 'medium',
      });
    }

    // Utilization optimization
    considerations.push({
      icon: TrendingUpIcon,
      title: 'Time Utilization',
      description: `Current schedule achieves ${metrics.utilizationRate.toFixed(1)}% utilization of available time.`,
      impact: metrics.utilizationRate > 80 ? 'high' : 'medium',
    });

    // Constraint satisfaction
    const constraintViolations = logs.filter(
      (log) => log.type === 'error'
    ).length;
    if (constraintViolations === 0) {
      considerations.push({
        icon: CheckCircleIcon,
        title: 'Constraint Satisfaction',
        description:
          'All scheduling constraints are satisfied without conflicts.',
        impact: 'high',
      });
    }

    return considerations;
  }, [tasks, metrics, logs]);

  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainIcon className="h-5 w-5" />
            Algorithm Insights
          </CardTitle>
          <CardDescription>
            Detailed analysis of scheduling decisions and optimizations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">
            <BrainIcon className="mx-auto mb-4 h-12 w-12 opacity-20" />
            <p>Add tasks and generate a schedule to see algorithm insights.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Algorithm Considerations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainIcon className="h-5 w-5" />
            Algorithm Considerations
          </CardTitle>
          <CardDescription>
            How the scheduling algorithm approaches your task arrangement
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {algorithmConsiderations.map((consideration, index) => {
            const IconComponent = consideration.icon;
            const impactColor =
              consideration.impact === 'high'
                ? 'text-dynamic-green'
                : consideration.impact === 'medium'
                  ? 'text-dynamic-orange'
                  : 'text-dynamic-blue';

            return (
              <div
                key={index}
                className="flex items-start gap-3 rounded-lg border p-4"
              >
                <IconComponent className={`mt-0.5 h-5 w-5 ${impactColor}`} />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{consideration.title}</h4>
                    <Badge
                      variant="outline"
                      className={`text-xs ${impactColor}`}
                    >
                      {consideration.impact} impact
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {consideration.description}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Scheduling Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Scheduling Metrics</CardTitle>
          <CardDescription>
            Quantitative analysis of your schedule optimization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Overview Stats */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="text-center">
              <div className="font-bold text-2xl text-dynamic-blue">
                {metrics.scheduledTasks}/{metrics.totalTasks}
              </div>
              <div className="text-muted-foreground text-sm">
                Tasks Scheduled
              </div>
            </div>
            <div className="text-center">
              <div className="font-bold text-2xl text-dynamic-green">
                {metrics.scheduledDuration.toFixed(1)}h
              </div>
              <div className="text-muted-foreground text-sm">
                Time Scheduled
              </div>
            </div>
            <div className="text-center">
              <div className="font-bold text-2xl text-dynamic-orange">
                {metrics.splitTasks}
              </div>
              <div className="text-muted-foreground text-sm">Split Tasks</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-2xl text-dynamic-purple">
                {metrics.utilizationRate.toFixed(0)}%
              </div>
              <div className="text-muted-foreground text-sm">Utilization</div>
            </div>
          </div>

          <Separator />

          {/* Deadline Performance */}
          {(metrics.deadlinesMet > 0 || metrics.deadlinesMissed > 0) && (
            <div className="space-y-3">
              <h4 className="flex items-center gap-2 font-medium">
                <TargetIcon className="h-4 w-4" />
                Deadline Performance
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Deadlines Met</span>
                  <span className="font-medium text-dynamic-green">
                    {metrics.deadlinesMet}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Deadlines Missed</span>
                  <span className="font-medium text-destructive">
                    {metrics.deadlinesMissed}
                  </span>
                </div>
                <Progress
                  value={
                    (metrics.deadlinesMet /
                      (metrics.deadlinesMet + metrics.deadlinesMissed)) *
                    100
                  }
                  className="h-2"
                />
              </div>
            </div>
          )}

          {/* Category Distribution */}
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 font-medium">
              <LayersIcon className="h-4 w-4" />
              Category Distribution
            </h4>
            <div className="space-y-2">
              {Object.entries(metrics.categoryDistribution).map(
                ([category, count]) => (
                  <div
                    key={category}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className={getCategoryColor(category)}>
                        {category}
                      </Badge>
                    </div>
                    <span className="font-medium">{count} tasks</span>
                  </div>
                )
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs and Warnings */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <InfoIcon className="h-5 w-5" />
              Scheduling Insights & Warnings
            </CardTitle>
            <CardDescription>
              Detailed feedback from the scheduling process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {logs.map((log, index) => (
                <Alert
                  key={index}
                  variant={log.type === 'error' ? 'destructive' : 'default'}
                  className="text-sm"
                >
                  {log.type === 'warning' && <InfoIcon className="h-4 w-4" />}
                  {log.type === 'error' && <XCircleIcon className="h-4 w-4" />}
                  <AlertTitle className="text-sm">
                    {log.type.charAt(0).toUpperCase() + log.type.slice(1)}
                  </AlertTitle>
                  <AlertDescription className="text-xs">
                    {log.message}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
