import { describe, expect, it } from 'vitest';
import { defaultActiveHours, defaultTasks } from './default.js';

describe('defaultActiveHours', () => {
  it('should have personal hours defined', () => {
    expect(defaultActiveHours.personal).toBeDefined();
    expect(Array.isArray(defaultActiveHours.personal)).toBe(true);
    expect(defaultActiveHours.personal.length).toBeGreaterThan(0);
  });

  it('should have work hours defined', () => {
    expect(defaultActiveHours.work).toBeDefined();
    expect(Array.isArray(defaultActiveHours.work)).toBe(true);
    expect(defaultActiveHours.work.length).toBeGreaterThan(0);
  });

  it('should have meeting hours defined', () => {
    expect(defaultActiveHours.meeting).toBeDefined();
    expect(Array.isArray(defaultActiveHours.meeting)).toBe(true);
    expect(defaultActiveHours.meeting.length).toBeGreaterThan(0);
  });

  describe('personal hours', () => {
    it('should start at 7:00', () => {
      const personalHours = defaultActiveHours.personal[0];
      expect(personalHours?.start.hour()).toBe(7);
      expect(personalHours?.start.minute()).toBe(0);
    });

    it('should end at 23:00', () => {
      const personalHours = defaultActiveHours.personal[0];
      expect(personalHours?.end.hour()).toBe(23);
      expect(personalHours?.end.minute()).toBe(0);
    });

    it('should have wider range than work hours', () => {
      const personalStart = defaultActiveHours.personal[0]?.start.hour() ?? 0;
      const personalEnd = defaultActiveHours.personal[0]?.end.hour() ?? 0;
      const workStart = defaultActiveHours.work[0]?.start.hour() ?? 0;
      const workEnd = defaultActiveHours.work[0]?.end.hour() ?? 0;

      const personalRange = personalEnd - personalStart;
      const workRange = workEnd - workStart;

      expect(personalRange).toBeGreaterThan(workRange);
    });
  });

  describe('work hours', () => {
    it('should start at 9:00', () => {
      const workHours = defaultActiveHours.work[0];
      expect(workHours?.start.hour()).toBe(9);
      expect(workHours?.start.minute()).toBe(0);
    });

    it('should end at 17:00', () => {
      const workHours = defaultActiveHours.work[0];
      expect(workHours?.end.hour()).toBe(17);
      expect(workHours?.end.minute()).toBe(0);
    });

    it('should be standard 8-hour workday', () => {
      const workHours = defaultActiveHours.work[0];
      const duration =
        (workHours?.end.hour() ?? 0) - (workHours?.start.hour() ?? 0);
      expect(duration).toBe(8);
    });
  });

  describe('meeting hours', () => {
    it('should start at 9:00 (same as work)', () => {
      const meetingHours = defaultActiveHours.meeting[0];
      expect(meetingHours?.start.hour()).toBe(9);
      expect(meetingHours?.start.minute()).toBe(0);
    });

    it('should end at 17:00 (same as work)', () => {
      const meetingHours = defaultActiveHours.meeting[0];
      expect(meetingHours?.end.hour()).toBe(17);
      expect(meetingHours?.end.minute()).toBe(0);
    });

    it('should match work hours', () => {
      const workHours = defaultActiveHours.work[0];
      const meetingHours = defaultActiveHours.meeting[0];

      expect(meetingHours?.start.hour()).toBe(workHours?.start.hour());
      expect(meetingHours?.end.hour()).toBe(workHours?.end.hour());
    });
  });

  describe('time range validity', () => {
    it('all time ranges should have start before end', () => {
      const categories = ['personal', 'work', 'meeting'] as const;

      categories.forEach((category) => {
        const hours = defaultActiveHours[category];
        hours.forEach((range) => {
          expect(range.start.isBefore(range.end)).toBe(true);
        });
      });
    });

    it('all times should have seconds and milliseconds set to 0', () => {
      const categories = ['personal', 'work', 'meeting'] as const;

      categories.forEach((category) => {
        const hours = defaultActiveHours[category];
        hours.forEach((range) => {
          expect(range.start.second()).toBe(0);
          expect(range.start.millisecond()).toBe(0);
          expect(range.end.second()).toBe(0);
          expect(range.end.millisecond()).toBe(0);
        });
      });
    });
  });
});

describe('defaultTasks', () => {
  it('should be an array', () => {
    expect(Array.isArray(defaultTasks)).toBe(true);
  });

  it('should have at least one task', () => {
    expect(defaultTasks.length).toBeGreaterThan(0);
  });

  describe('default task properties', () => {
    const defaultTask = defaultTasks[0];

    it('should have an id', () => {
      expect(defaultTask?.id).toBeDefined();
      expect(typeof defaultTask?.id).toBe('string');
    });

    it('should have a name', () => {
      expect(defaultTask?.name).toBeDefined();
      expect(typeof defaultTask?.name).toBe('string');
    });

    it('should have a duration of 1 hour', () => {
      expect(defaultTask?.duration).toBe(1);
    });

    it('should have a minDuration of 0.25 hours (15 minutes)', () => {
      expect(defaultTask?.minDuration).toBe(0.25);
    });

    it('should have a maxDuration of 2 hours', () => {
      expect(defaultTask?.maxDuration).toBe(2);
    });

    it('should have category set to work', () => {
      expect(defaultTask?.category).toBe('work');
    });

    it('should have priority set to normal', () => {
      expect(defaultTask?.priority).toBe('normal');
    });

    it('should allow splitting', () => {
      expect(defaultTask?.allowSplit).toBe(true);
    });
  });

  describe('task validation', () => {
    defaultTasks.forEach((task, index) => {
      describe(`task ${index + 1}`, () => {
        it('should have positive duration', () => {
          expect(task.duration).toBeGreaterThan(0);
        });

        it('should have valid min/max duration relationship', () => {
          expect(task.minDuration).toBeLessThanOrEqual(task.duration);
          expect(task.maxDuration).toBeGreaterThanOrEqual(task.duration);
        });

        it('should have minDuration <= maxDuration', () => {
          expect(task.minDuration).toBeLessThanOrEqual(task.maxDuration);
        });

        it('should have valid category', () => {
          const validCategories = ['work', 'personal', 'meeting'];
          expect(validCategories).toContain(task.category);
        });

        it('should have valid priority', () => {
          const validPriorities = ['critical', 'high', 'normal', 'low'];
          expect(validPriorities).toContain(task.priority);
        });
      });
    });
  });
});
