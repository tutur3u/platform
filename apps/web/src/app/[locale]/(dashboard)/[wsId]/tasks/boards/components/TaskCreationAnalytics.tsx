'use client';

import { Card } from '@tuturuuu/ui/card';
import { AlertTriangle } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useMemo } from 'react';

interface Task {
  id: string;
  name: string;
  description?: string;
  priority?: number | null;
  created_at?: string;
  updated_at?: string;
  end_date?: string | null;
  boardId: string;
  boardName: string;
  listName: string;
  listStatus?: string;
  archived?: boolean;
}

interface TaskCreationAnalyticsProps {
  allTasks: Task[];
  selectedBoard: string | null;
}

export function TaskCreationAnalytics({
  allTasks,
  selectedBoard,
}: TaskCreationAnalyticsProps) {
  const filteredTasks = useMemo(() => {
    if (!selectedBoard) return allTasks;
    return allTasks.filter((task) => task.boardId === selectedBoard);
  }, [allTasks, selectedBoard]);

  const taskAnalytics = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Task creation trends
    const thisWeekCreated = filteredTasks.filter((task) => {
      return task.created_at && new Date(task.created_at) >= oneWeekAgo;
    }).length;

    const lastWeekCreated = filteredTasks.filter((task) => {
      return (
        task.created_at &&
        new Date(task.created_at) >= twoWeeksAgo &&
        new Date(task.created_at) < oneWeekAgo
      );
    }).length;

    const thisMonthCreated = filteredTasks.filter((task) => {
      return task.created_at && new Date(task.created_at) >= oneMonthAgo;
    }).length;

    // Task distribution by priority
    const priorityDistribution = {
      urgent: filteredTasks.filter((task) => task.priority === 1).length,
      high: filteredTasks.filter((task) => task.priority === 2).length,
      medium: filteredTasks.filter((task) => task.priority === 3).length,
      low: filteredTasks.filter((task) => task.priority === 4).length,
      unset: filteredTasks.filter(
        (task) => !task.priority || task.priority === null
      ).length,
    };

    // Task type distribution by board lists
    const typeDistribution: { [key: string]: number } = {};
    filteredTasks.forEach((task) => {
      const listName = task.listName || 'Unknown';
      typeDistribution[listName] = (typeDistribution[listName] || 0) + 1;
    });

    // Average time to start (created_at to first status change)
    const timeToStartData = filteredTasks
      .filter(
        (task) =>
          task.created_at &&
          task.updated_at &&
          task.listStatus !== 'not_started' &&
          new Date(task.updated_at).getTime() >
            new Date(task.created_at).getTime()
      )
      .map((task) => {
        const created = new Date(task.created_at!);
        const updated = new Date(task.updated_at!);
        return (updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24); // days
      });

    const avgTimeToStart =
      timeToStartData.length > 0
        ? timeToStartData.reduce((sum, time) => sum + time, 0) /
          timeToStartData.length
        : 0;

    // Task creation rate trend - improved logic for clarity
    const creationTrend =
      lastWeekCreated === 0
        ? thisWeekCreated > 0
          ? 100
          : 0 // 100% increase if we had 0 last week but have tasks this week
        : ((thisWeekCreated - lastWeekCreated) / lastWeekCreated) * 100;

    // Backlog growth (not started tasks older than 1 week)
    const backlogTasks = filteredTasks.filter(
      (task) =>
        task.listStatus === 'not_started' &&
        task.created_at &&
        new Date(task.created_at) < oneWeekAgo
    ).length;

    return {
      thisWeekCreated,
      lastWeekCreated,
      thisMonthCreated,
      creationTrend,
      priorityDistribution,
      typeDistribution,
      avgTimeToStart,
      backlogTasks,
      totalTasks: filteredTasks.length,
    };
  }, [filteredTasks]);

  const priorityConfig = [
    {
      key: 'urgent',
      label: '🔥 Urgent',
      color: 'bg-red-500',
      count: taskAnalytics.priorityDistribution.urgent,
    },
    {
      key: 'high',
      label: '⚡ High',
      color: 'bg-orange-500',
      count: taskAnalytics.priorityDistribution.high,
    },
    {
      key: 'medium',
      label: '📋 Medium',
      color: 'bg-yellow-500',
      count: taskAnalytics.priorityDistribution.medium,
    },
    {
      key: 'low',
      label: '📝 Low',
      color: 'bg-green-500',
      count: taskAnalytics.priorityDistribution.low,
    },
    {
      key: 'unset',
      label: '❓ Unset',
      color: 'bg-gray-400',
      count: taskAnalytics.priorityDistribution.unset,
    },
  ];

  const topTaskTypes = Object.entries(taskAnalytics.typeDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-medium">Task Creation & Flow</h4>
        <span className="text-xs text-muted-foreground">
          {taskAnalytics.totalTasks} total tasks
        </span>
      </div>

      <div className="space-y-4">
        {/* Creation Trend */}
        <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-blue-600">
                {taskAnalytics.thisWeekCreated}
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300">
                Tasks created this week
              </div>
            </div>
            <div className="text-right">
              <div
                className={cn(
                  'text-sm font-medium',
                  taskAnalytics.creationTrend > 0
                    ? 'text-green-600'
                    : taskAnalytics.creationTrend < 0
                      ? 'text-red-600'
                      : 'text-gray-600'
                )}
              >
                {taskAnalytics.creationTrend > 0
                  ? '↗'
                  : taskAnalytics.creationTrend < 0
                    ? '↘'
                    : '→'}
                {Math.abs(taskAnalytics.creationTrend).toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">
                vs last week ({taskAnalytics.lastWeekCreated})
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-gray-50 p-2 text-center dark:bg-gray-800/50">
            <div className="font-medium text-purple-600">
              {taskAnalytics.thisMonthCreated}
            </div>
            <div className="text-muted-foreground">This month</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-2 text-center dark:bg-gray-800/50">
            <div className="font-medium text-orange-600">
              {taskAnalytics.avgTimeToStart > 0
                ? `${taskAnalytics.avgTimeToStart.toFixed(1)}d`
                : 'N/A'}
            </div>
            <div className="text-muted-foreground">Avg. time to start</div>
          </div>
        </div>

        {/* Priority Distribution */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Priority Distribution</div>
          <div className="space-y-1">
            {priorityConfig
              .filter((p) => p.count > 0)
              .map((priority) => (
                <div
                  key={priority.key}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn('h-2 w-2 rounded', priority.color)}
                    ></div>
                    <span className="text-xs">{priority.label}</span>
                  </div>
                  <span className="text-xs font-medium">{priority.count}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Task Types */}
        {topTaskTypes.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Top Task Types</div>
            <div className="space-y-1">
              {topTaskTypes.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="flex-1 truncate text-xs">{type}</span>
                  <span className="ml-2 text-xs font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Backlog Alert */}
        {taskAnalytics.backlogTasks > 0 && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-2 dark:border-yellow-800 dark:bg-yellow-900/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 text-yellow-600" />
              <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">
                {taskAnalytics.backlogTasks} tasks in backlog (&gt;1 week old)
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
