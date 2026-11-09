'use client';

import { Progress } from '@tuturuuu/ui/progress';
import type { Quarter } from '../../types';

interface QuarterProgressProps {
  quarter: Quarter;
  selectedDate: Date;
}

export function QuarterProgress({
  quarter,
  selectedDate,
}: QuarterProgressProps) {
  const isCurrentQuarter =
    Math.ceil((selectedDate.getMonth() + 1) / 3) === quarter?.quarter;
  if (!isCurrentQuarter) return null;

  const totalTasks =
    quarter.milestones?.reduce(
      (acc, milestone) => acc + (milestone.tasks?.length || 0),
      0
    ) || 1;

  const completedTasks = 0; // TODO: Add completion tracking
  const progress = (completedTasks / totalTasks) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>
          Q{quarter.quarter}: {quarter.focus}
        </span>
        <span className="text-muted-foreground text-xs">
          {completedTasks}/{totalTasks} tasks
        </span>
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}
