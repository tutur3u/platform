'use client';

import { useMemo } from 'react';
import { Card } from '@tuturuuu/ui/card';
import { Clock } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';

interface TaskWorkflowAnalyticsProps {
  allTasks: any[];
  selectedBoard: string | null;
}

export function TaskWorkflowAnalytics({
  allTasks,
  selectedBoard,
}: TaskWorkflowAnalyticsProps) {
  const filteredTasks = useMemo(() => {
    if (!selectedBoard) return allTasks;
    return allTasks.filter((task) => task.boardId === selectedBoard);
  }, [allTasks, selectedBoard]);

  const workflowAnalytics = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Task efficiency metrics
    const completedTasks = filteredTasks.filter(
      (task) => task.listStatus === 'done' || task.listStatus === 'closed' || task.archived
    );

    const activeTasks = filteredTasks.filter(
      (task) => task.listStatus === 'active'
    );

    const notStartedTasks = filteredTasks.filter(
      (task) => task.listStatus === 'not_started' || !task.listStatus
    );

    // Cycle time calculation (creation to completion)
    const cycleTimeData = completedTasks
      .filter((task) => task.created_at && task.updated_at)
      .map((task) => {
        const created = new Date(task.created_at);
        const completed = new Date(task.updated_at);
        return (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
      });

    const avgCycleTime = cycleTimeData.length > 0 
      ? cycleTimeData.reduce((sum, time) => sum + time, 0) / cycleTimeData.length
      : 0;

    // Task age distribution
    const taskAges = filteredTasks
      .filter((task) => task.created_at)
      .map((task) => {
        const created = new Date(task.created_at);
        return (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
      });

    const newTasks = taskAges.filter((age) => age <= 3).length; // 0-3 days
    const recentTasks = taskAges.filter((age) => age > 3 && age <= 7).length; // 4-7 days
    const oldTasks = taskAges.filter((age) => age > 7 && age <= 30).length; // 1-4 weeks
    const staleTasks = taskAges.filter((age) => age > 30).length; // >1 month

    // Workload distribution
    const totalTasks = filteredTasks.length;
    const completionRate = totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0;

    // Recent activity
    const recentActivity = filteredTasks.filter((task) =>
      task.updated_at && new Date(task.updated_at) >= oneWeekAgo
    ).length;

    // Priority distribution effectiveness
    const highPriorityCompleted = completedTasks.filter((task) => task.priority === 1 || task.priority === 2).length;
    const totalHighPriority = filteredTasks.filter((task) => task.priority === 1 || task.priority === 2).length;
    const priorityEfficiency = totalHighPriority > 0 ? (highPriorityCompleted / totalHighPriority) * 100 : 0;

    return {
      totalTasks,
      completedTasks: completedTasks.length,
      activeTasks: activeTasks.length,
      notStartedTasks: notStartedTasks.length,
      avgCycleTime,
      completionRate,
      recentActivity,
      priorityEfficiency,
      ageDistribution: {
        new: newTasks,
        recent: recentTasks,
        old: oldTasks,
        stale: staleTasks,
      },
    };
  }, [filteredTasks]);

  const ageConfig = [
    { key: 'new', label: '🆕 New (0-3d)', count: workflowAnalytics.ageDistribution.new, color: 'bg-green-500' },
    { key: 'recent', label: '📅 Recent (4-7d)', count: workflowAnalytics.ageDistribution.recent, color: 'bg-blue-500' },
    { key: 'old', label: '📚 Old (1-4w)', count: workflowAnalytics.ageDistribution.old, color: 'bg-yellow-500' },
    { key: 'stale', label: '⏰ Stale (>1m)', count: workflowAnalytics.ageDistribution.stale, color: 'bg-red-500' },
  ];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-medium">Workflow & Efficiency</h4>
        <span className="text-xs text-muted-foreground">
          {workflowAnalytics.totalTasks} total tasks
        </span>
      </div>
      
      <div className="space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 p-3 dark:from-emerald-900/20 dark:to-emerald-800/20">
            <div className="text-lg font-bold text-emerald-600">
              {workflowAnalytics.completionRate.toFixed(0)}%
            </div>
            <div className="text-xs text-emerald-700 dark:text-emerald-300">
              Completion Rate
            </div>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-violet-50 to-violet-100 p-3 dark:from-violet-900/20 dark:to-violet-800/20">
            <div className="text-lg font-bold text-violet-600">
              {workflowAnalytics.avgCycleTime > 0 ? `${workflowAnalytics.avgCycleTime.toFixed(1)}d` : 'N/A'}
            </div>
            <div className="text-xs text-violet-700 dark:text-violet-300">
              Avg. Cycle Time
            </div>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Task Status</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center rounded-lg bg-gray-50 p-2 dark:bg-gray-800/50">
              <div className="font-medium text-green-600">
                {workflowAnalytics.completedTasks}
              </div>
              <div className="text-muted-foreground">Done</div>
            </div>
            <div className="text-center rounded-lg bg-gray-50 p-2 dark:bg-gray-800/50">
              <div className="font-medium text-blue-600">
                {workflowAnalytics.activeTasks}
              </div>
              <div className="text-muted-foreground">Active</div>
            </div>
            <div className="text-center rounded-lg bg-gray-50 p-2 dark:bg-gray-800/50">
              <div className="font-medium text-gray-600">
                {workflowAnalytics.notStartedTasks}
              </div>
              <div className="text-muted-foreground">Not Started</div>
            </div>
          </div>
        </div>

        {/* Task Age Distribution */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Task Age</div>
          <div className="space-y-1">
            {ageConfig.filter(age => age.count > 0).map((age) => (
              <div key={age.key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn('h-2 w-2 rounded', age.color)}></div>
                  <span className="text-xs">{age.label}</span>
                </div>
                <span className="text-xs font-medium">{age.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Efficiency Indicators */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Efficiency Metrics</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-orange-50 p-2 dark:bg-orange-900/20">
              <div className="font-medium text-orange-600">
                {workflowAnalytics.recentActivity}
              </div>
              <div className="text-orange-700 dark:text-orange-300">Recent Updates</div>
            </div>
            <div className="rounded-lg bg-indigo-50 p-2 dark:bg-indigo-900/20">
              <div className="font-medium text-indigo-600">
                {workflowAnalytics.priorityEfficiency.toFixed(0)}%
              </div>
              <div className="text-indigo-700 dark:text-indigo-300">Priority Focus</div>
            </div>
          </div>
        </div>

        {/* Stale Task Warning */}
        {workflowAnalytics.ageDistribution.stale > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 text-red-600" />
              <span className="text-xs font-medium text-red-700 dark:text-red-300">
                {workflowAnalytics.ageDistribution.stale} stale tasks need attention
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
} 