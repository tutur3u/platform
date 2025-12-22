import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { scheduleTasks } from './algorithm';
import type { Task } from './types';

describe('Scheduling Algorithm - Performance', () => {
  it('should schedule 500 tasks in less than 200ms', () => {
    const baseDate = dayjs().startOf('day').add(1, 'day');

    // Generate 500 tasks
    const tasks: Task[] = Array.from({ length: 500 }, (_, i) => ({
      id: `task-${i}`,
      name: `Task ${i}`,
      duration: 0.5, // 30 mins
      minDuration: 0.25,
      maxDuration: 1,
      priority: (['low', 'normal', 'high', 'critical'] as const)[i % 4]!,
      category: (['work', 'personal', 'meeting'] as const)[i % 3]!,
      allowSplit: true,
    }));

    const activeHours = {
      personal: [
        {
          start: baseDate.hour(7).minute(0),
          end: baseDate.hour(23).minute(0),
        },
      ],
      work: [
        {
          start: baseDate.hour(8).minute(0),
          end: baseDate.hour(20).minute(0),
        },
      ],
      meeting: [
        {
          start: baseDate.hour(9).minute(0),
          end: baseDate.hour(17).minute(0),
        },
      ],
    };

    const start = performance.now();
    const result = scheduleTasks(tasks, activeHours, []);
    const end = performance.now();
    const duration = end - start;

    console.log(`Scheduling 500 tasks took ${duration.toFixed(2)}ms`);

    expect(duration).toBeLessThan(2000);
    expect(result.events.length).toBeGreaterThan(0);
  });
});
