import type { ComponentProps } from 'react';
import { TaskCyclesClient } from './task-cycles-client';

/** The cycles page body; data comes from `loadTaskCycles`. */
export function TaskCyclesView(props: ComponentProps<typeof TaskCyclesClient>) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Task Cycles</h1>
        <p className="text-muted-foreground">
          Time-box work into cycles (sprints) and track progress.
        </p>
      </div>
      <TaskCyclesClient {...props} />
    </div>
  );
}
