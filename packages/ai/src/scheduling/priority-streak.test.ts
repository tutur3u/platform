import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { scheduleTasks } from './algorithm.js';
import { defaultActiveHours } from './default.js';
import type { Task } from './types.js';

describe('Scheduling Algorithm - Priority & Streaks', () => {
  it('should prioritize habits with streaks over generic tasks of same base priority', () => {
    // Set fixed time for reproducibility
    const baseDate = dayjs().startOf('day').add(1, 'day');

    const tasks: Task[] = [
      {
        id: 'task-1',
        name: 'Generic Normal Task',
        duration: 1,
        minDuration: 1,
        maxDuration: 1,
        priority: 'normal',
        category: 'work',
        allowSplit: false,
      },
      {
        id: 'habit-1',
        name: 'Habit with 10-day Streak',
        duration: 1,
        minDuration: 1,
        maxDuration: 1,
        priority: 'normal',
        category: 'work',
        allowSplit: false,
        isHabit: true,
        streak: 10,
      },
    ];

    const activeHours = {
      ...defaultActiveHours,
      work: [
        {
          start: baseDate.hour(9).minute(0),
          end: baseDate.hour(17).minute(0),
        },
      ],
    };

    const result = scheduleTasks(tasks, activeHours, []);

    // Habit should be scheduled before the generic task because of the streak bonus
    const habitEvent = result.events.find((e) => e.taskId === 'habit-1');
    const taskEvent = result.events.find((e) => e.taskId === 'task-1');

    expect(habitEvent).toBeDefined();
    expect(taskEvent).toBeDefined();

    const habitStart = dayjs(habitEvent!.range.start);
    const taskStart = dayjs(taskEvent!.range.start);

    expect(habitStart.isBefore(taskStart)).toBe(true);
  });
});
