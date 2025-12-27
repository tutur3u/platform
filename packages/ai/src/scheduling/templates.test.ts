import { describe, expect, it } from 'vitest';
import { templateScenarios } from './templates';

describe('templateScenarios', () => {
  it('should be an array of template scenarios', () => {
    expect(Array.isArray(templateScenarios)).toBe(true);
    expect(templateScenarios.length).toBeGreaterThan(0);
  });

  it('should have unique scenario names', () => {
    const names = templateScenarios.map((s) => s.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  describe('each scenario', () => {
    templateScenarios.forEach((scenario) => {
      describe(`"${scenario.name}"`, () => {
        it('should have a name', () => {
          expect(scenario.name).toBeDefined();
          expect(typeof scenario.name).toBe('string');
          expect(scenario.name.length).toBeGreaterThan(0);
        });

        it('should have a description', () => {
          expect(scenario.description).toBeDefined();
          expect(typeof scenario.description).toBe('string');
          expect(scenario.description.length).toBeGreaterThan(0);
        });

        it('should have tasks array', () => {
          expect(Array.isArray(scenario.tasks)).toBe(true);
          expect(scenario.tasks.length).toBeGreaterThan(0);
        });

        it('should have unique task IDs within scenario', () => {
          const ids = scenario.tasks.map((t) => t.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        });
      });
    });
  });

  describe('task structure validation', () => {
    const allTasks = templateScenarios.flatMap((s) => s.tasks);

    it('all tasks should have required fields', () => {
      allTasks.forEach((task) => {
        expect(task.id).toBeDefined();
        expect(task.name).toBeDefined();
        expect(task.duration).toBeDefined();
        expect(task.category).toBeDefined();
        expect(task.priority).toBeDefined();
      });
    });

    it('all tasks should have valid category', () => {
      const validCategories = ['work', 'personal', 'meeting'];
      allTasks.forEach((task) => {
        expect(validCategories).toContain(task.category);
      });
    });

    it('all tasks should have valid priority', () => {
      const validPriorities = ['critical', 'high', 'normal', 'low'];
      allTasks.forEach((task) => {
        expect(validPriorities).toContain(task.priority);
      });
    });

    it('all tasks should have positive duration', () => {
      allTasks.forEach((task) => {
        expect(task.duration).toBeGreaterThan(0);
      });
    });

    it('all tasks should have valid min/max duration relationship', () => {
      allTasks.forEach((task) => {
        if (task.minDuration !== undefined && task.maxDuration !== undefined) {
          expect(task.minDuration).toBeLessThanOrEqual(task.maxDuration);
        }
      });
    });
  });

  describe('specific scenarios', () => {
    it('should have "Basic Work Day" scenario', () => {
      const basicWorkDay = templateScenarios.find(
        (s) => s.name === 'Basic Work Day'
      );
      expect(basicWorkDay).toBeDefined();
      expect(basicWorkDay?.tasks.length).toBeGreaterThan(0);
    });

    it('should have "Task Splitting Challenge" scenario', () => {
      const splittingChallenge = templateScenarios.find(
        (s) => s.name === 'Task Splitting Challenge'
      );
      expect(splittingChallenge).toBeDefined();
      // Tasks in this scenario should allow splitting
      splittingChallenge?.tasks.forEach((task) => {
        expect(task.allowSplit).toBe(true);
      });
    });

    it('should have "Deadline Pressure" scenario', () => {
      const deadlinePressure = templateScenarios.find(
        (s) => s.name === 'Deadline Pressure'
      );
      expect(deadlinePressure).toBeDefined();
      // Most tasks should have deadlines
      const tasksWithDeadlines = deadlinePressure?.tasks.filter(
        (t) => t.deadline !== undefined
      );
      expect(tasksWithDeadlines?.length).toBeGreaterThan(0);
    });

    it('should have "Overloaded Schedule" scenario', () => {
      const overloaded = templateScenarios.find(
        (s) => s.name === 'Overloaded Schedule'
      );
      expect(overloaded).toBeDefined();
      // Total duration should exceed typical day length
      const totalDuration =
        overloaded?.tasks.reduce((sum, t) => sum + t.duration, 0) ?? 0;
      expect(totalDuration).toBeGreaterThan(8);
    });

    it('should have "Emergency Response" scenario with critical tasks', () => {
      const emergency = templateScenarios.find(
        (s) => s.name === 'Emergency Response'
      );
      expect(emergency).toBeDefined();
      const criticalTasks = emergency?.tasks.filter(
        (t) => t.priority === 'critical'
      );
      expect(criticalTasks?.length).toBeGreaterThan(0);
    });

    it('should have "Mixed Categories" scenario with diverse categories', () => {
      const mixed = templateScenarios.find(
        (s) => s.name === 'Mixed Categories'
      );
      expect(mixed).toBeDefined();
      const categories = new Set(mixed?.tasks.map((t) => t.category));
      expect(categories.size).toBeGreaterThanOrEqual(2);
    });

    it('should have "Meeting-Heavy Day" scenario', () => {
      const meetingHeavy = templateScenarios.find(
        (s) => s.name === 'Meeting-Heavy Day'
      );
      expect(meetingHeavy).toBeDefined();
      const meetingTasks = meetingHeavy?.tasks.filter(
        (t) => t.category === 'meeting'
      );
      expect(meetingTasks?.length).toBeGreaterThan(
        (meetingHeavy?.tasks.length ?? 0) / 2
      );
    });
  });

  describe('priority distribution', () => {
    it('should have tasks of all priority levels across scenarios', () => {
      const allTasks = templateScenarios.flatMap((s) => s.tasks);
      const priorities = new Set(allTasks.map((t) => t.priority));

      expect(priorities.has('critical')).toBe(true);
      expect(priorities.has('high')).toBe(true);
      expect(priorities.has('normal')).toBe(true);
      expect(priorities.has('low')).toBe(true);
    });
  });

  describe('category distribution', () => {
    it('should have tasks of all categories across scenarios', () => {
      const allTasks = templateScenarios.flatMap((s) => s.tasks);
      const categories = new Set(allTasks.map((t) => t.category));

      expect(categories.has('work')).toBe(true);
      expect(categories.has('personal')).toBe(true);
      expect(categories.has('meeting')).toBe(true);
    });
  });
});
