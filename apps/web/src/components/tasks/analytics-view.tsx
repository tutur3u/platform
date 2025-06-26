'use client';

import { useMemo } from 'react';
import type { Task } from '@tuturuuu/types/primitives/TaskBoard';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { 
  isToday, 
  isPast, 
  parseISO, 
  isValid,
} from 'date-fns';

// Import existing analytics components
import { TaskCreationAnalytics } from '../../app/[locale]/(dashboard)/[wsId]/tasks/boards/components/TaskCreationAnalytics';
import { TaskWorkflowAnalytics } from '../../app/[locale]/(dashboard)/[wsId]/tasks/boards/components/TaskWorkflowAnalytics';

export interface AnalyticsViewProps {
  tasks: Task[];
  className?: string;
}

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

const StatCard = ({ title, value, description, icon, trend, className }: StatCardProps) => (
  <Card className={className}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
      {trend && (
        <div className={cn(
          'flex items-center gap-1 text-xs mt-2',
          trend.isPositive ? 'text-green-600' : 'text-red-600'
        )}>
          <TrendingUp className={cn(
            'h-3 w-3',
            !trend.isPositive && 'rotate-180'
          )} />
          <span>{Math.abs(trend.value)}%</span>
          <span className="text-muted-foreground">from last week</span>
        </div>
      )}
    </CardContent>
  </Card>
);

function parseTaskDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  try {
    const date = parseISO(dateStr);
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
}

export function AnalyticsView({ tasks, className }: AnalyticsViewProps) {
  // Transform tasks to match the expected format for existing components
  const transformedTasks = useMemo(() => {
    return tasks.map(task => ({
      ...task,
      boardId: 'current-board', // Default board ID for compatibility
      boardName: 'Current Board',
      listName: task.list_id || 'Default List',
      listStatus: 'active' as const,
    }));
  }, [tasks]);

  // Calculate basic overview stats
  const overviewStats = useMemo(() => {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(task => task.archived).length;
    
    // Date-based analytics
    const tasksWithDueDates = tasks.filter(task => task.end_date);
    const overdueTasks = tasksWithDueDates.filter(task => {
      const dueDate = parseTaskDate(task.end_date);
      return dueDate && isPast(dueDate) && !task.archived;
    });
    
    const dueTodayTasks = tasksWithDueDates.filter(task => {
      const dueDate = parseTaskDate(task.end_date);
      return dueDate && isToday(dueDate) && !task.archived;
    });

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      totalTasks,
      completedTasks,
      overdueTasks: overdueTasks.length,
      dueTodayTasks: dueTodayTasks.length,
      completionRate,
    };
  }, [tasks]);

  return (
    <div className={cn('p-6 space-y-6', className)}>
      {/* Overview Stats */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Task Analytics Dashboard</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Tasks"
            value={overviewStats.totalTasks}
            description="All tasks in this view"
            icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
          />
          
          <StatCard
            title="Completion Rate"
            value={`${overviewStats.completionRate}%`}
            description={`${overviewStats.completedTasks} of ${overviewStats.totalTasks} completed`}
            icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
          />
          
          <StatCard
            title="Overdue Tasks"
            value={overviewStats.overdueTasks}
            description="Tasks past their due date"
            icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
            className={overviewStats.overdueTasks > 0 ? "border-red-200" : undefined}
          />
          
          <StatCard
            title="Due Today"
            value={overviewStats.dueTodayTasks}
            description="Tasks due today"
            icon={<Calendar className="h-4 w-4 text-blue-600" />}
            className={overviewStats.dueTodayTasks > 0 ? "border-blue-200" : undefined}
          />
        </div>
      </div>

      {/* Detailed Analytics using existing components */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TaskCreationAnalytics 
          allTasks={transformedTasks}
          selectedBoard={null}
        />
        
        <TaskWorkflowAnalytics 
          allTasks={transformedTasks}
          selectedBoard={null}
        />
      </div>

      {/* Additional insights */}
      <Card>
        <CardHeader>
          <CardTitle>Analytics Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-4 bg-blue-50 rounded-lg dark:bg-blue-900/20">
                <h4 className="font-medium text-blue-900 dark:text-blue-100">📊 Task Overview</h4>
                <p className="text-blue-700 dark:text-blue-300 mt-1">
                  {overviewStats.totalTasks} total tasks with {overviewStats.completionRate}% completion rate
                </p>
              </div>
              
              <div className="p-4 bg-green-50 rounded-lg dark:bg-green-900/20">
                <h4 className="font-medium text-green-900 dark:text-green-100">✅ Progress</h4>
                <p className="text-green-700 dark:text-green-300 mt-1">
                  {overviewStats.completedTasks} tasks completed successfully
                </p>
              </div>
              
              <div className="p-4 bg-orange-50 rounded-lg dark:bg-orange-900/20">
                <h4 className="font-medium text-orange-900 dark:text-orange-100">⚡ Attention Needed</h4>
                <p className="text-orange-700 dark:text-orange-300 mt-1">
                  {overviewStats.overdueTasks + overviewStats.dueTodayTasks} tasks need immediate attention
                </p>
              </div>
            </div>
            
            <div className="pt-4 border-t text-center text-sm text-muted-foreground">
              Analytics powered by comprehensive task tracking and performance metrics
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 