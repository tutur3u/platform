import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { scheduleTasks } from './algorithm';
import { defaultActiveHours } from './default';
import type { Event, Task } from './types';

describe('Scheduling Algorithm - Locked Events', () => {
  it('should not schedule a task during a locked event time slot', () => {
    // Set a fixed base date to avoid "now" shifts during test execution
    const baseDate = dayjs().startOf('day').add(1, 'day'); // Tomorrow

    // 1. Define a locked event from 10:00 to 12:00
    const lockedEvent: Event = {
      id: 'locked-1',
      name: 'Doctor Appointment',
      range: {
        start: baseDate.hour(10).minute(0).second(0).millisecond(0),
        end: baseDate.hour(12).minute(0).second(0).millisecond(0),
      },
      locked: true,
    };

    // 2. Define a task that would otherwise want to start as early as possible
    const tasks: Task[] = [
      {
        id: 'task-1',
        name: 'Work on Report',
        duration: 2, // 2 hours
        minDuration: 1,
        maxDuration: 4,
        priority: 'high',
        category: 'work',
        allowSplit: false,
      },
    ];

    // Customize active hours to ensure the task has room but is pushed by the locked event
    const activeHours = {
      ...defaultActiveHours,
      work: [
        {
          start: baseDate.hour(9).minute(0),
          end: baseDate.hour(17).minute(0),
        }
      ]
    };

    // 3. Schedule
    const result = scheduleTasks(tasks, activeHours, [lockedEvent]);

    // 4. Verify
    const taskEvent = result.events.find((e) => e.taskId === 'task-1');
    expect(taskEvent).toBeDefined();

    const taskStart = dayjs(taskEvent!.range.start);
    const taskEnd = dayjs(taskEvent!.range.end);
    const lockedStart = dayjs(lockedEvent.range.start);
    const lockedEnd = dayjs(lockedEvent.range.end);

    // The task should not overlap with the locked event
    const hasOverlap = taskStart.isBefore(lockedEnd) && taskEnd.isAfter(lockedStart);
    expect(hasOverlap).toBe(false);
  });

  it('should preserve existing locked events in the output', () => {
    const lockedEvent: Event = {
      id: 'locked-1',
      name: 'Doctor Appointment',
      range: {
        start: dayjs().hour(10).minute(0).second(0).millisecond(0),
        end: dayjs().hour(12).minute(0).second(0).millisecond(0),
      },
      locked: true,
    };

    const result = scheduleTasks([], defaultActiveHours, [lockedEvent]);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.id).toBe('locked-1');
    expect(result.events[0]!.locked).toBe(true);
  });
});
