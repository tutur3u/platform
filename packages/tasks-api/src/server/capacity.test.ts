import { describe, expect, it, vi } from 'vitest';
import {
  loadTaskCapacityWarnings,
  parseTaskCapacityViolation,
} from './capacity';

describe('task capacity helpers', () => {
  it('normalizes PostgreSQL capacity failures for HTTP 409 responses', () => {
    expect(
      parseTaskCapacityViolation({
        message: 'TASK_CAPACITY_EXCEEDED',
        details: JSON.stringify({
          ruleId: 'rule-1',
          ruleName: 'Ready',
          metric: 'task_count',
          currentValue: 4,
          attemptedValue: 5,
          limit: 4,
        }),
      })
    ).toEqual({
      code: 'TASK_CAPACITY_EXCEEDED',
      violations: [
        {
          ruleId: 'rule-1',
          ruleName: 'Ready',
          metric: 'task_count',
          currentValue: 4,
          attemptedValue: 5,
          limit: 4,
        },
      ],
    });
  });

  it('returns only exceeded enabled soft rules as warnings', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'soft',
          name: 'Queue',
          enabled: true,
          enforcement: 'soft',
          metric: 'task_count',
          current_value: 6,
          limit_value: 5,
        },
        {
          id: 'hard',
          name: 'Hard',
          enabled: true,
          enforcement: 'hard',
          metric: 'task_count',
          current_value: 6,
          limit_value: 5,
        },
        {
          id: 'safe',
          name: 'Safe',
          enabled: true,
          enforcement: 'soft',
          metric: 'task_count',
          current_value: 5,
          limit_value: 5,
        },
      ],
      error: null,
    });
    await expect(
      loadTaskCapacityWarnings({ rpc } as never, 'board-1')
    ).resolves.toEqual([
      expect.objectContaining({
        ruleId: 'soft',
        enforcement: 'soft',
        currentValue: 6,
        limit: 5,
      }),
    ]);
  });
});
