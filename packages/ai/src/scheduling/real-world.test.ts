import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { scheduleTasks } from './algorithm';
import type { Event, Task } from './types';

describe('Scheduling Algorithm - Real World Scenarios', () => {
  it('should handle a "Student Day" scenario correctly', () => {
    // Tomorrow at 00:00
    const tomorrow = dayjs().startOf('day').add(1, 'day');

    // 1. Locked classes (Immovable)
    const lockedEvents: Event[] = [
      {
        id: 'class-1',
        name: 'Math Class',
        range: {
          start: tomorrow.hour(9).minute(0),
          end: tomorrow.hour(10).minute(30),
        },
        locked: true,
        taskId: '',
      },
      {
        id: 'class-2',
        name: 'Physics Class',
        range: {
          start: tomorrow.hour(13).minute(0),
          end: tomorrow.hour(14).minute(30),
        },
        locked: true,
        taskId: '',
      },
    ];

    // 2. Flexible Tasks and Habits
    const tasks: Task[] = [
      {
        id: 'habit-gym',
        name: 'Gym',
        duration: 1.5,
        minDuration: 1,
        maxDuration: 2,
        priority: 'normal',
        category: 'personal',
        allowSplit: false,
        isHabit: true,
        streak: 5,
        timePreference: 'morning',
      },
      {
        id: 'task-study',
        name: 'Deep Study Physics',
        duration: 3,
        minDuration: 1,
        maxDuration: 2,
        priority: 'high',
        category: 'work',
        allowSplit: true,
        energyLoad: 'high',
      },
      {
        id: 'habit-lunch',
        name: 'Lunch',
        duration: 1,
        minDuration: 1,
        maxDuration: 1,
        priority: 'critical',
        category: 'personal',
        allowSplit: false,
        isHabit: true,
        timePreference: 'afternoon',
      },
    ];

    const activeHours = {
      personal: [
        {
          start: tomorrow.hour(7).minute(0),
          end: tomorrow.hour(22).minute(0),
        },
      ],
      work: [
        {
          start: tomorrow.hour(8).minute(0),
          end: tomorrow.hour(20).minute(0),
        },
      ],
      meeting: [
        {
          start: tomorrow.hour(9).minute(0),
          end: tomorrow.hour(17).minute(0),
        },
      ],
    };

    const result = scheduleTasks(tasks, activeHours, lockedEvents, {
      energyProfile: 'morning_person',
      schedulingSettings: { min_buffer: 15 }, // 15-minute minimum buffer
    });

    // 1. Verify all tasks are scheduled (Study task might be split)
    const scheduledTaskIds = new Set(result.events.map((e) => e.taskId));
    expect(scheduledTaskIds.has('habit-gym')).toBe(true);
    expect(scheduledTaskIds.has('task-study')).toBe(true);
    expect(scheduledTaskIds.has('habit-lunch')).toBe(true);

    // 2. Verify Immutability: Locked events should still be at their original times
    const mathClass = result.events.find((e) => e.id === 'class-1');
    expect(mathClass).toBeDefined();
    expect(mathClass!.range.start.hour()).toBe(9);
    expect(mathClass!.range.start.minute()).toBe(0);

    const physicsClass = result.events.find((e) => e.id === 'class-2');
    expect(physicsClass).toBeDefined();
    expect(physicsClass!.range.start.hour()).toBe(13);
    expect(physicsClass!.range.start.minute()).toBe(0);

    // 3. Verify Gym is in the morning
    const gym = result.events.find((e) => e.taskId === 'habit-gym');
    expect(dayjs(gym!.range.start).hour()).toBeLessThan(12);

    // 4. Verify Lunch is in the afternoon
    const lunch = result.events.find((e) => e.taskId === 'habit-lunch');
    expect(dayjs(lunch!.range.start).hour()).toBeGreaterThanOrEqual(12);

    // 5. Verify Buffers: All events on the same day should have >= 15 min gap
    const sortedEvents = [...result.events].sort((a, b) =>
      a.range.start.diff(b.range.start)
    );

    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const current = sortedEvents[i]!;
      const next = sortedEvents[i + 1]!;

      const gap = next.range.start.diff(current.range.end, 'minute');
      expect(gap).toBeGreaterThanOrEqual(15);
    }
  });
});
