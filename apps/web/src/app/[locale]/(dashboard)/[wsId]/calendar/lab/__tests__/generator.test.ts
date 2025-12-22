import { describe, expect, it } from 'vitest';
import { generateRealisticScenario } from '../generator';
import { CalendarScenarioSchema } from '../types';

describe('Realistic Scenario Generator', () => {
  it('should generate a valid scenario', () => {
    const scenario = generateRealisticScenario({ taskCount: 5, habitCount: 3 });
    const result = CalendarScenarioSchema.safeParse(scenario);
    if (!result.success) {
      console.error(result.error);
    }
    expect(result.success).toBe(true);
  });

  it('should generate requested number of tasks and habits', () => {
    const taskCount = 10;
    const habitCount = 5;
    const scenario = generateRealisticScenario({ taskCount, habitCount });
    expect(scenario.tasks.length).toBe(taskCount);
    expect(scenario.habits.length).toBe(habitCount);
  });
});
