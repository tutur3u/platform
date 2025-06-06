'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { InfoIcon } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';

interface Task {
  title: string;
  description: string;
  priority: string;
  milestone: string;
  timeline: string;
}

interface Quarter {
  quarter: number;
  focus: string;
  milestones?: Array<{
    title: string;
    tasks?: Task[];
  }>;
}

interface MonthlyOverviewProps {
  tasks: Task[];
  selectedDate: Date;
  yearPlan?: {
    quarters?: Quarter[];
  };
}

export function MonthlyOverview({
  tasks,
  selectedDate,
  yearPlan,
}: MonthlyOverviewProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <InfoIcon className="h-5 w-5" />
          Monthly Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Tasks This Month</span>
            <Badge variant="secondary">{tasks.length}</Badge>
          </div>
          <Progress value={(tasks.length / 10) * 100} className="h-2" />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Priority Distribution</span>
          <div className="grid grid-cols-3 gap-2">
            {['high', 'medium', 'low'].map((priority) => {
              const count = tasks.filter(
                (task) => task.priority === priority
              ).length;
              const total = tasks.length || 1;
              const percentage = Math.round((count / total) * 100);

              return (
                <div
                  key={priority}
                  className="group relative rounded-lg border bg-muted/50 p-2 text-center transition-colors hover:bg-muted/80"
                >
                  <div
                    className={cn(
                      'text-xs font-medium',
                      priority === 'high'
                        ? 'text-destructive'
                        : priority === 'medium'
                          ? 'text-primary'
                          : 'text-muted-foreground'
                    )}
                  >
                    {priority.toUpperCase()}
                  </div>
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs text-muted-foreground">
                    {percentage}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Quarter Progress</span>
          <div className="space-y-1">
            {yearPlan?.quarters?.map((quarter) => {
              const isCurrentQuarter =
                Math.ceil((selectedDate.getMonth() + 1) / 3) ===
                quarter?.quarter;
              if (!isCurrentQuarter) return null;

              const totalTasks =
                quarter.milestones?.reduce(
                  (acc, milestone) => acc + (milestone.tasks?.length || 0),
                  0
                ) || 1;

              const completedTasks = 0; // TODO: Add completion tracking
              const progress = (completedTasks / totalTasks) * 100;

              return (
                <div key={quarter.quarter} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      Q{quarter.quarter}: {quarter.focus}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {completedTasks}/{totalTasks} tasks
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
