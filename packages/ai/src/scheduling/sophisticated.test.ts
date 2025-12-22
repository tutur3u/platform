import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { scheduleTasks } from './algorithm';
import { defaultActiveHours } from './default';
import type { Task } from './types';

describe('Scheduling Algorithm - Sophisticated Features', () => {
  it('should prefer peak energy hours for high load tasks', () => {
    // Set base date to tomorrow to avoid "now" issues
    const baseDate = dayjs().startOf('day').add(1, 'day');

    const tasks: Task[] = [
      {
        id: 'high-load-task',
        name: 'Brain Intensive Work',
        duration: 2,
        minDuration: 2,
        maxDuration: 2,
        priority: 'normal',
        category: 'work',
        allowSplit: false,
        energyLoad: 'high',
      },
    ];

    const activeHours = {
      ...defaultActiveHours,
      work: [
        {
          start: baseDate.hour(8).minute(0),
          end: baseDate.hour(20).minute(0),
        }
      ],
    };

    // User is a morning person (Peak: 8am-12pm)
    const result = scheduleTasks(tasks, activeHours, [], {
      energyProfile: 'morning_person',
    });

    const event = result.events.find((e) => e.taskId === 'high-load-task');
    expect(event).toBeDefined();

    const startHour = dayjs(event!.range.start).hour();
    // Should be in morning peak (8am-12pm)
    expect(startHour).toBeGreaterThanOrEqual(8);
    expect(startHour).toBeLessThan(12);
  });

  it('should respect minimum buffer settings between tasks', () => {
    const baseDate = dayjs().startOf('day').add(1, 'day');

    const tasks: Task[] = [
      {
        id: 'task-1',
        name: 'Task 1',
        duration: 1,
        minDuration: 1,
        maxDuration: 1,
        priority: 'normal',
        category: 'work',
        allowSplit: false,
      },
      {
        id: 'task-2',
        name: 'Task 2',
        duration: 1,
        minDuration: 1,
        maxDuration: 1,
        priority: 'normal',
        category: 'work',
        allowSplit: false,
      },
    ];

    const activeHours = {
      ...defaultActiveHours,
      work: [
        {
          start: baseDate.hour(9).minute(0),
          end: baseDate.hour(17).minute(0),
        }
      ],
    };

    // 30 minute minimum buffer
    const result = scheduleTasks(tasks, activeHours, [], {
      schedulingSettings: { min_buffer: 30 },
    });

    const event1 = result.events.find((e) => e.taskId === 'task-1');
    const event2 = result.events.find((e) => e.taskId === 'task-2');

    expect(event1).toBeDefined();
    expect(event2).toBeDefined();

    const start1 = dayjs(event1!.range.start);
    const end1 = dayjs(event1!.range.end);
    const start2 = dayjs(event2!.range.start);
    const end2 = dayjs(event2!.range.end);

    // Ensure there's at least 30 minutes between them
    if (end1.isBefore(start2)) {
      expect(start2.diff(end1, 'minute')).toBeGreaterThanOrEqual(30);
    } else {
      expect(start1.diff(end2, 'minute')).toBeGreaterThanOrEqual(30);
    }
  });

  it('should not reschedule habits to inappropriate times (Smart Adaptive Windows)', () => {
    // Set base date to tomorrow
    const baseDate = dayjs().startOf('day').add(1, 'day');

    const tasks: Task[] = [
      {
        id: 'habit-lunch',
        name: 'Lunch',
        duration: 1,
        minDuration: 1,
        maxDuration: 1,
        priority: 'normal',
        category: 'personal',
        allowSplit: false,
        isHabit: true,
        timePreference: 'morning', // Morning ends at 12pm
      },
    ];

    // Only afternoon slots are available (2pm-5pm)
    const activeHours = {
      ...defaultActiveHours,
      personal: [
        {
          start: baseDate.hour(14).minute(0),
          end: baseDate.hour(17).minute(0),
        }
      ],
    };

    const result = scheduleTasks(tasks, activeHours, []);

    // Habit should NOT be scheduled because 2pm-5pm is not 'morning'
    const event = result.events.find((e) => e.taskId === 'habit-lunch');
    expect(event).toBeUndefined();

    // There should be a warning about not being able to schedule
    expect(
      result.logs.some((l) => l.message.includes('could not be scheduled'))
    ).toBe(true);
  });
});
