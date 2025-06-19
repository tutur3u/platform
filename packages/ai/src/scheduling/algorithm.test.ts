import { defaultActiveHours, defaultTasks } from './default';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

describe('Scheduling Algorithm', () => {
  describe('DateRange interface', () => {
    it('should create valid date ranges', () => {
      const start = dayjs('2024-01-01T09:00:00');
      const end = dayjs('2024-01-01T17:00:00');

      const range = { start, end };

      expect(range.start.isValid()).toBe(true);
      expect(range.end.isValid()).toBe(true);
      expect(range.end.isAfter(range.start)).toBe(true);
    });
  });

  describe('Event interface', () => {
    it('should create valid events', () => {
      const event = {
        id: 'event-1',
        name: 'Team Meeting',
        range: {
          start: dayjs('2024-01-01T10:00:00'),
          end: dayjs('2024-01-01T11:00:00'),
        },
      };

      expect(event.id).toBe('event-1');
      expect(event.name).toBe('Team Meeting');
      expect(event.range.start.isValid()).toBe(true);
      expect(event.range.end.isValid()).toBe(true);
    });
  });

  describe('Task interface', () => {
    it('should create valid tasks', () => {
      const task = {
        id: 'task-1',
        name: 'Complete project',
        duration: 120, // 2 hours in minutes
        events: [],
      };

      expect(task.id).toBe('task-1');
      expect(task.name).toBe('Complete project');
      expect(task.duration).toBe(120);
      expect(Array.isArray(task.events)).toBe(true);
    });

    it('should create tasks with events', () => {
      const task = {
        id: 'task-2',
        name: 'Review code',
        duration: 60,
        events: [
          {
            id: 'event-1',
            name: 'Code review session',
            range: {
              start: dayjs('2024-01-01T14:00:00'),
              end: dayjs('2024-01-01T15:00:00'),
            },
          },
        ],
      };

      expect(task.events).toHaveLength(1);
      expect(task.events[0]?.name).toBe('Code review session');
    });
  });

  describe('ActiveHours interface', () => {
    it('should have valid structure for active hours', () => {
      const activeHours = {
        personal: [
          {
            start: dayjs().hour(7).minute(0).second(0).millisecond(0),
            end: dayjs().hour(23).minute(0).second(0).millisecond(0),
          },
        ],
        work: [
          {
            start: dayjs().hour(9).minute(0).second(0).millisecond(0),
            end: dayjs().hour(17).minute(0).second(0).millisecond(0),
          },
        ],
        meeting: [
          {
            start: dayjs().hour(9).minute(0).second(0).millisecond(0),
            end: dayjs().hour(17).minute(0).second(0).millisecond(0),
          },
        ],
      };

      expect(Array.isArray(activeHours.personal)).toBe(true);
      expect(Array.isArray(activeHours.work)).toBe(true);
      expect(Array.isArray(activeHours.meeting)).toBe(true);

      expect(activeHours.personal[0]?.start.isValid()).toBe(true);
      expect(activeHours.work[0]?.end.isAfter(activeHours.work[0]?.start)).toBe(
        true
      );
    });
  });

  describe('DefaultActiveHours', () => {
    it('should have correct default active hours configuration', () => {
      expect(defaultActiveHours).toBeDefined();
      expect(defaultActiveHours.personal).toHaveLength(1);
      expect(defaultActiveHours.work).toHaveLength(1);
      expect(defaultActiveHours.meeting).toHaveLength(1);

      // Test personal hours (7:00 - 23:00)
      expect(defaultActiveHours.personal[0]?.start.format('HH:mm')).toBe(
        '07:00'
      );
      expect(defaultActiveHours.personal[0]?.end.format('HH:mm')).toBe('23:00');

      // Test work hours (9:00 - 17:00)
      expect(defaultActiveHours.work[0]?.start.format('HH:mm')).toBe('09:00');
      expect(defaultActiveHours.work[0]?.end.format('HH:mm')).toBe('17:00');

      // Test meeting hours (9:00 - 17:00)
      expect(defaultActiveHours.meeting[0]?.start.format('HH:mm')).toBe(
        '09:00'
      );
      expect(defaultActiveHours.meeting[0]?.end.format('HH:mm')).toBe('17:00');
    });
  });

  describe('DefaultTasks', () => {
    it('should have correct default tasks configuration', () => {
      expect(defaultTasks).toBeDefined();
      expect(Array.isArray(defaultTasks)).toBe(true);
      expect(defaultTasks).toHaveLength(1);
    });

    it('should have valid task structure', () => {
      const task = defaultTasks[0];

      expect(task).toBeDefined();
      expect(task?.id).toBe('task-1');
      expect(task?.name).toBe('Task 1');
      expect(task?.duration).toBe(1);
      expect(Array.isArray(task?.events)).toBe(true);
      expect(task?.events).toHaveLength(0);
    });

    it('should have valid task properties types', () => {
      const task = defaultTasks[0];

      expect(typeof task?.id).toBe('string');
      expect(typeof task?.name).toBe('string');
      expect(typeof task?.duration).toBe('number');
      expect(Array.isArray(task?.events)).toBe(true);
    });

    it('should have positive duration', () => {
      const task = defaultTasks[0];

      expect(task?.duration).toBeGreaterThan(0);
    });

    it('should have non-empty id and name', () => {
      const task = defaultTasks[0];

      expect(task?.id).toBeTruthy();
      expect(task?.name).toBeTruthy();
      expect(task?.id.length).toBeGreaterThan(0);
      expect(task?.name.length).toBeGreaterThan(0);
    });
  });

  describe('schedule function', () => {
    it('should schedule a non-splittable task as a single block if possible', () => {
      const { scheduleTasks } = require('./algorithm');
      const tasks = [
        {
          id: 'single-block',
          name: 'Non-splittable Task',
          duration: 2,
          minDuration: 1,
          maxDuration: 2,
          category: 'work',
          events: [],
          allowSplit: false,
        },
      ];
      const result = scheduleTasks(tasks, defaultActiveHours);
      expect(result.events.length).toBe(1);
      expect(result.events[0].name).toBe('Non-splittable Task');
      expect(result.events[0].partNumber).toBeUndefined();
    });

    it('should not schedule a non-splittable task if no single block is available', () => {
      const { scheduleTasks } = require('./algorithm');
      const tasks = [
        {
          id: 'single-block-fail',
          name: 'Non-splittable Task',
          duration: 10, // longer than any available slot
          minDuration: 1,
          maxDuration: 10,
          category: 'work',
          events: [],
          allowSplit: false,
        },
      ];
      const result = scheduleTasks(tasks, defaultActiveHours);
      expect(result.events.length).toBe(0);
      expect(result.logs.some((log: any) => log.type === 'error')).toBe(true);
    });

    it('should split a task if allowSplit is true or undefined and needed', () => {
      const { scheduleTasks } = require('./algorithm');
      const tasks = [
        {
          id: 'splittable',
          name: 'Splittable Task',
          duration: 6,
          minDuration: 1,
          maxDuration: 2,
          category: 'work',
          events: [],
          allowSplit: true,
        },
      ];
      const result = scheduleTasks(tasks, defaultActiveHours);
      expect(result.events.length).toBeGreaterThan(1);
      expect(result.events[0].name).toContain('Part 1');
    });
  });
});
