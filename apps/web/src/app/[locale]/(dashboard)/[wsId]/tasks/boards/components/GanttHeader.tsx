'use client';

interface ProductivityStats {
  completionRate: string;
  onTimeRate: string;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
}

interface GanttHeaderProps {
  productivityStats: ProductivityStats;
}

export function GanttHeader({ productivityStats }: GanttHeaderProps) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h4 className="font-medium">Task Gantt Timeline</h4>
        <p className="text-sm text-muted-foreground">
          Visual timeline showing task lifecycle from creation to completion
        </p>
      </div>

      {/* Productivity Stats */}
      <div className="flex items-center gap-4 text-sm">
        <div className="text-center">
          <div className="font-semibold text-green-600">
            {productivityStats.completionRate}%
          </div>
          <div className="text-muted-foreground">Completion</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-blue-600">
            {productivityStats.onTimeRate}%
          </div>
          <div className="text-muted-foreground">On-Time</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-purple-600">
            {productivityStats.totalTasks}
          </div>
          <div className="text-muted-foreground">Tasks</div>
        </div>
      </div>
    </div>
  );
}
