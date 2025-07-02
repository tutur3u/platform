'use client';

import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Calendar } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import {
  endOfMonth,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
} from 'date-fns';
import { useMemo } from 'react';
import type { Task, YearPlan } from '../../types';

interface MonthlyOverviewProps {
  tasks: Task[];
  selectedDate: Date;
  yearPlan: YearPlan | undefined;
}

export function MonthlyOverview({
  tasks,
  selectedDate,
  yearPlan,
}: MonthlyOverviewProps) {
  const stats = useMemo(() => {
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);

    const allTasks = tasks.filter((task) => {
      try {
        const taskStart = parseISO(task.start_date);
        const taskEnd = parseISO(task.end_date);
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

    const completedTasks = allTasks.filter(
      (task) => task.status === 'completed'
    );

    const totalHours = allTasks.reduce(
      (sum, task) => sum + (task.estimatedHours ?? 0),
      0
    );

    const completedHours = completedTasks.reduce(
      (sum, task) => sum + (task.estimatedHours ?? 0),
      0
    );

    return {
      totalTasks: allTasks.length,
      completedTasks: completedTasks.length,
      totalHours,
      completedHours,
      completion:
        Math.round((completedTasks.length / allTasks.length) * 100) || 0,
      hoursCompletion: Math.round((completedHours / totalHours) * 100) || 0,
    };
  }, [tasks, selectedDate]);

  const currentMilestone = useMemo(() => {
    if (!yearPlan?.quarters) return null;

    for (const quarter of yearPlan.quarters) {
      if (!quarter?.milestones) continue;

      const milestone = quarter.milestones.find((m) => {
        if (!m?.start_date || !m?.end_date) return false;
        try {
          const milestoneStart = parseISO(m.start_date);
          const milestoneEnd = parseISO(m.end_date);
          return isWithinInterval(selectedDate, {
            start: milestoneStart,
            end: milestoneEnd,
          });
        } catch (error) {
          console.error('Error parsing dates for milestone:', m.title, error);
          return false;
        }
      });

      if (milestone) {
        return {
          ...milestone,
          quarter: quarter.quarter,
          focus: quarter.focus,
        };
      }
    }

    return null;
  }, [yearPlan, selectedDate]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Monthly Overview
          </CardTitle>
          <CardDescription>{format(selectedDate, 'MMMM yyyy')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Tasks Progress</span>
              <span className="text-muted-foreground text-sm">
                {stats.completedTasks}/{stats.totalTasks} tasks
              </span>
            </div>
            <Progress value={stats.completion} className="h-2" />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Hours Progress</span>
              <span className="text-muted-foreground text-sm">
                {stats.completedHours}/{stats.totalHours} hours
              </span>
            </div>
            <Progress value={stats.hoursCompletion} className="h-2" />
          </div>

          {currentMilestone && (
            <div className="mt-4">
              <h4 className="mb-2 font-medium text-sm">Current Milestone</h4>
              <div className="rounded-md border bg-card/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{currentMilestone.title}</span>
                  <Badge variant="outline">Q{currentMilestone.quarter}</Badge>
                </div>
                {currentMilestone.description && (
                  <p className="mt-1 text-muted-foreground text-sm">
                    {currentMilestone.description}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
                  <Calendar className="h-3 w-3" />
                  {format(parseISO(currentMilestone.start_date), 'MMM d')} -{' '}
                  {format(parseISO(currentMilestone.end_date), 'MMM d, yyyy')}
                </div>
                {currentMilestone.progress !== undefined && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">
                        Progress
                      </span>
                      <span className="font-medium text-xs">
                        {currentMilestone.progress}%
                      </span>
                    </div>
                    <Progress
                      value={currentMilestone.progress}
                      className="h-1"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
