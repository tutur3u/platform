import { describe, expect, it } from 'vitest';
import { scoreSlotForHabit, scoreSlotForTask } from './duration-optimizer';

describe('Duration Optimizer - Weights', () => {
  const mockHabit = {
    duration_minutes: 60,
    ideal_time: '09:00',
  };

  const mockSlot = {
    start: new Date('2024-01-01T09:00:00Z'),
    end: new Date('2024-01-01T10:00:00Z'),
    maxAvailable: 60,
  };

  const mockTask = {
    priority: 'normal',
    preferredTimeOfDay: 'morning',
  };

  it('should use default habit weight if not provided', () => {
    const score = scoreSlotForHabit(mockHabit as any, mockSlot as any, 'UTC');
    // Default ideal_time bonus is 1000
    expect(score).toBeGreaterThanOrEqual(1000);
  });

  it('should use custom habit weight when provided', () => {
    const customWeights = { habitIdealTimeBonus: 5000 };
    const score = scoreSlotForHabit(
      mockHabit as any,
      mockSlot as any,
      'UTC',
      customWeights
    );
    expect(score).toBeGreaterThanOrEqual(5000);
  });

  it('should use default task weight if not provided', () => {
    const score = scoreSlotForTask(
      mockTask as any,
      mockSlot as any,
      new Date(),
      'UTC'
    );
    // Default task preference bonus is 500
    expect(score).toBeGreaterThanOrEqual(500);
  });

  it('should use custom task weight when provided', () => {
    const customWeights = { taskPreferenceBonus: 2000 };
    const score = scoreSlotForTask(
      mockTask as any,
      mockSlot as any,
      new Date(),
      'UTC',
      customWeights
    );
    expect(score).toBeGreaterThanOrEqual(2000);
  });
});
