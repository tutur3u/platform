/**
 * Tests for Priority Calculator
 *
 * Tests priority inference, comparison, bumping rules, and sorting.
 */

import { describe, expect, it } from 'vitest';

import type { PrioritizableItem } from './priority-calculator';
import {
  calculatePriorityScore,
  canBump,
  comparePriority,
  getEffectivePriority,
  isHigherPriority,
  isUrgent,
  PRIORITY_WEIGHTS,
  sortByPriority,
} from './priority-calculator';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createItem(
  overrides: Partial<PrioritizableItem & { created_at?: string }> = {}
): PrioritizableItem & { created_at?: string } {
  return {
    priority: null,
    end_date: null,
    ...overrides,
  };
}

function hoursFromNow(hours: number): string {
  const date = new Date();
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  return date.toISOString();
}

function daysFromNow(days: number): string {
  return hoursFromNow(days * 24);
}

// ============================================================================
// TESTS: PRIORITY_WEIGHTS
// ============================================================================

describe('PRIORITY_WEIGHTS', () => {
  it('should have critical as highest weight', () => {
    expect(PRIORITY_WEIGHTS.critical).toBe(4);
  });

  it('should have high as second highest weight', () => {
    expect(PRIORITY_WEIGHTS.high).toBe(3);
  });

  it('should have normal as third weight', () => {
    expect(PRIORITY_WEIGHTS.normal).toBe(2);
  });

  it('should have low as lowest weight', () => {
    expect(PRIORITY_WEIGHTS.low).toBe(1);
  });

  it('should maintain correct ordering', () => {
    expect(PRIORITY_WEIGHTS.critical).toBeGreaterThan(PRIORITY_WEIGHTS.high);
    expect(PRIORITY_WEIGHTS.high).toBeGreaterThan(PRIORITY_WEIGHTS.normal);
    expect(PRIORITY_WEIGHTS.normal).toBeGreaterThan(PRIORITY_WEIGHTS.low);
  });
});

// ============================================================================
// TESTS: getEffectivePriority
// ============================================================================

describe('getEffectivePriority', () => {
  describe('with explicit priority', () => {
    it('should return critical when explicitly set', () => {
      const item = createItem({ priority: 'critical' });
      expect(getEffectivePriority(item)).toBe('critical');
    });

    it('should return high when explicitly set', () => {
      const item = createItem({ priority: 'high' });
      expect(getEffectivePriority(item)).toBe('high');
    });

    it('should return normal when explicitly set', () => {
      const item = createItem({ priority: 'normal' });
      expect(getEffectivePriority(item)).toBe('normal');
    });

    it('should return low when explicitly set', () => {
      const item = createItem({ priority: 'low' });
      expect(getEffectivePriority(item)).toBe('low');
    });

    it('should use explicit priority even with deadline', () => {
      const item = createItem({
        priority: 'low',
        end_date: hoursFromNow(1), // Would infer critical without explicit
      });
      expect(getEffectivePriority(item)).toBe('low');
    });
  });

  describe('priority inference from deadline', () => {
    it('should infer critical for overdue items', () => {
      const item = createItem({ end_date: hoursFromNow(-5) }); // 5 hours ago
      expect(getEffectivePriority(item)).toBe('critical');
    });

    it('should infer critical for deadline within 24 hours', () => {
      const item = createItem({ end_date: hoursFromNow(12) }); // 12 hours from now
      expect(getEffectivePriority(item)).toBe('critical');
    });

    it('should infer critical for deadline exactly at 24 hours', () => {
      // At exactly 24 hours, hoursUntilDeadline <= 24 is true
      const item = createItem({ end_date: hoursFromNow(24) });
      expect(getEffectivePriority(item)).toBe('critical');
    });

    it('should infer high for deadline between 24 and 48 hours', () => {
      const item = createItem({ end_date: hoursFromNow(36) }); // 36 hours from now
      expect(getEffectivePriority(item)).toBe('high');
    });

    it('should infer high for deadline exactly at 48 hours', () => {
      const item = createItem({ end_date: hoursFromNow(48) });
      expect(getEffectivePriority(item)).toBe('high');
    });

    it('should infer normal for deadline beyond 48 hours', () => {
      const item = createItem({ end_date: hoursFromNow(72) }); // 3 days
      expect(getEffectivePriority(item)).toBe('normal');
    });

    it('should infer normal for deadline far in future', () => {
      const item = createItem({ end_date: daysFromNow(30) }); // 30 days
      expect(getEffectivePriority(item)).toBe('normal');
    });

    it('should infer low when no deadline', () => {
      const item = createItem({ end_date: null });
      expect(getEffectivePriority(item)).toBe('low');
    });

    it('should infer low when deadline is undefined', () => {
      const item = createItem({});
      expect(getEffectivePriority(item)).toBe('low');
    });
  });
});

// ============================================================================
// TESTS: comparePriority
// ============================================================================

describe('comparePriority', () => {
  it('should return negative when first is higher priority', () => {
    expect(comparePriority('critical', 'high')).toBeLessThan(0);
    expect(comparePriority('critical', 'normal')).toBeLessThan(0);
    expect(comparePriority('critical', 'low')).toBeLessThan(0);
    expect(comparePriority('high', 'normal')).toBeLessThan(0);
    expect(comparePriority('high', 'low')).toBeLessThan(0);
    expect(comparePriority('normal', 'low')).toBeLessThan(0);
  });

  it('should return positive when second is higher priority', () => {
    expect(comparePriority('low', 'critical')).toBeGreaterThan(0);
    expect(comparePriority('low', 'high')).toBeGreaterThan(0);
    expect(comparePriority('low', 'normal')).toBeGreaterThan(0);
    expect(comparePriority('normal', 'critical')).toBeGreaterThan(0);
    expect(comparePriority('normal', 'high')).toBeGreaterThan(0);
    expect(comparePriority('high', 'critical')).toBeGreaterThan(0);
  });

  it('should return 0 when priorities are equal', () => {
    expect(comparePriority('critical', 'critical')).toBe(0);
    expect(comparePriority('high', 'high')).toBe(0);
    expect(comparePriority('normal', 'normal')).toBe(0);
    expect(comparePriority('low', 'low')).toBe(0);
  });
});

// ============================================================================
// TESTS: isHigherPriority
// ============================================================================

describe('isHigherPriority', () => {
  it('should return true when first priority is higher', () => {
    expect(isHigherPriority('critical', 'high')).toBe(true);
    expect(isHigherPriority('critical', 'normal')).toBe(true);
    expect(isHigherPriority('critical', 'low')).toBe(true);
    expect(isHigherPriority('high', 'normal')).toBe(true);
    expect(isHigherPriority('high', 'low')).toBe(true);
    expect(isHigherPriority('normal', 'low')).toBe(true);
  });

  it('should return false when first priority is lower', () => {
    expect(isHigherPriority('low', 'critical')).toBe(false);
    expect(isHigherPriority('low', 'high')).toBe(false);
    expect(isHigherPriority('low', 'normal')).toBe(false);
    expect(isHigherPriority('normal', 'critical')).toBe(false);
    expect(isHigherPriority('normal', 'high')).toBe(false);
    expect(isHigherPriority('high', 'critical')).toBe(false);
  });

  it('should return false when priorities are equal', () => {
    expect(isHigherPriority('critical', 'critical')).toBe(false);
    expect(isHigherPriority('high', 'high')).toBe(false);
    expect(isHigherPriority('normal', 'normal')).toBe(false);
    expect(isHigherPriority('low', 'low')).toBe(false);
  });
});

// ============================================================================
// TESTS: isUrgent
// ============================================================================

describe('isUrgent', () => {
  it('should return true for explicit critical priority', () => {
    const item = createItem({ priority: 'critical' });
    expect(isUrgent(item)).toBe(true);
  });

  it('should return true for inferred critical (overdue)', () => {
    const item = createItem({ end_date: hoursFromNow(-1) });
    expect(isUrgent(item)).toBe(true);
  });

  it('should return true for inferred critical (< 24h)', () => {
    const item = createItem({ end_date: hoursFromNow(12) });
    expect(isUrgent(item)).toBe(true);
  });

  it('should return false for high priority', () => {
    const item = createItem({ priority: 'high' });
    expect(isUrgent(item)).toBe(false);
  });

  it('should return false for normal priority', () => {
    const item = createItem({ priority: 'normal' });
    expect(isUrgent(item)).toBe(false);
  });

  it('should return false for low priority', () => {
    const item = createItem({ priority: 'low' });
    expect(isUrgent(item)).toBe(false);
  });

  it('should return false for item with no deadline', () => {
    const item = createItem({});
    expect(isUrgent(item)).toBe(false);
  });
});

// ============================================================================
// TESTS: canBump
// ============================================================================

describe('canBump', () => {
  describe('critical priority bumper', () => {
    it('should bump high priority targets', () => {
      const bumper = createItem({ priority: 'critical' });
      const target = createItem({ priority: 'high' });
      expect(canBump(bumper, target)).toBe(true);
    });

    it('should bump normal priority targets', () => {
      const bumper = createItem({ priority: 'critical' });
      const target = createItem({ priority: 'normal' });
      expect(canBump(bumper, target)).toBe(true);
    });

    it('should bump low priority targets', () => {
      const bumper = createItem({ priority: 'critical' });
      const target = createItem({ priority: 'low' });
      expect(canBump(bumper, target)).toBe(true);
    });

    it('should NOT bump other critical priority targets', () => {
      const bumper = createItem({ priority: 'critical' });
      const target = createItem({ priority: 'critical' });
      expect(canBump(bumper, target)).toBe(false);
    });
  });

  describe('non-critical bumpers cannot bump', () => {
    it('high priority cannot bump anything', () => {
      const bumper = createItem({ priority: 'high' });
      expect(canBump(bumper, createItem({ priority: 'normal' }))).toBe(false);
      expect(canBump(bumper, createItem({ priority: 'low' }))).toBe(false);
    });

    it('normal priority cannot bump anything', () => {
      const bumper = createItem({ priority: 'normal' });
      expect(canBump(bumper, createItem({ priority: 'low' }))).toBe(false);
    });

    it('low priority cannot bump anything', () => {
      const bumper = createItem({ priority: 'low' });
      expect(canBump(bumper, createItem({ priority: 'low' }))).toBe(false);
    });
  });

  describe('inferred priority bumping', () => {
    it('should allow bumping when bumper has inferred critical (urgent deadline)', () => {
      const bumper = createItem({ end_date: hoursFromNow(6) }); // Inferred critical
      const target = createItem({ priority: 'normal' });
      expect(canBump(bumper, target)).toBe(true);
    });

    it('should NOT allow bumping when target also has inferred critical', () => {
      const bumper = createItem({ end_date: hoursFromNow(6) }); // Inferred critical
      const target = createItem({ end_date: hoursFromNow(12) }); // Also inferred critical
      expect(canBump(bumper, target)).toBe(false);
    });
  });
});

// ============================================================================
// TESTS: sortByPriority
// ============================================================================

describe('sortByPriority', () => {
  describe('primary sort by priority', () => {
    it('should sort critical before high', () => {
      const items = [
        createItem({ priority: 'high' }),
        createItem({ priority: 'critical' }),
      ];
      const sorted = sortByPriority(items);
      expect(sorted[0]!.priority).toBe('critical');
      expect(sorted[1]!.priority).toBe('high');
    });

    it('should sort all priorities correctly', () => {
      const items = [
        createItem({ priority: 'low' }),
        createItem({ priority: 'normal' }),
        createItem({ priority: 'critical' }),
        createItem({ priority: 'high' }),
      ];
      const sorted = sortByPriority(items);
      expect(sorted[0]!.priority).toBe('critical');
      expect(sorted[1]!.priority).toBe('high');
      expect(sorted[2]!.priority).toBe('normal');
      expect(sorted[3]!.priority).toBe('low');
    });

    it('should use inferred priority when not explicitly set', () => {
      const items = [
        createItem({ end_date: daysFromNow(10) }), // Inferred normal
        createItem({ end_date: hoursFromNow(12) }), // Inferred critical
        createItem({}), // Inferred low (no deadline)
      ];
      const sorted = sortByPriority(items);
      expect(getEffectivePriority(sorted[0]!)).toBe('critical');
      expect(getEffectivePriority(sorted[1]!)).toBe('normal');
      expect(getEffectivePriority(sorted[2]!)).toBe('low');
    });
  });

  describe('secondary sort by deadline', () => {
    it('should sort by deadline when priorities are equal', () => {
      const earlier = hoursFromNow(60);
      const later = hoursFromNow(100);
      const items = [
        createItem({ priority: 'normal', end_date: later }),
        createItem({ priority: 'normal', end_date: earlier }),
      ];
      const sorted = sortByPriority(items);
      expect(sorted[0]!.end_date).toBe(earlier);
      expect(sorted[1]!.end_date).toBe(later);
    });

    it('should put items with deadline before items without', () => {
      const items = [
        createItem({ priority: 'normal', end_date: null }),
        createItem({ priority: 'normal', end_date: daysFromNow(5) }),
      ];
      const sorted = sortByPriority(items);
      expect(sorted[0]!.end_date).not.toBeNull();
      expect(sorted[1]!.end_date).toBeNull();
    });
  });

  describe('tertiary sort by created_at', () => {
    it('should sort by creation date when priority and deadline are equal', () => {
      const deadline = daysFromNow(5);
      const older = '2024-01-01T00:00:00Z';
      const newer = '2024-01-15T00:00:00Z';
      const items = [
        createItem({
          priority: 'normal',
          end_date: deadline,
          created_at: newer,
        }),
        createItem({
          priority: 'normal',
          end_date: deadline,
          created_at: older,
        }),
      ];
      const sorted = sortByPriority(items);
      expect(sorted[0]!.created_at).toBe(older);
      expect(sorted[1]!.created_at).toBe(newer);
    });
  });

  it('should not modify the original array', () => {
    const items = [
      createItem({ priority: 'low' }),
      createItem({ priority: 'critical' }),
    ];
    const originalFirst = items[0];
    sortByPriority(items);
    expect(items[0]).toBe(originalFirst);
  });
});

// ============================================================================
// TESTS: calculatePriorityScore
// ============================================================================

describe('calculatePriorityScore', () => {
  describe('base score from priority', () => {
    it('should give critical items base score of 4000', () => {
      const item = createItem({ priority: 'critical' });
      const score = calculatePriorityScore(item);
      expect(score).toBeGreaterThanOrEqual(4000);
    });

    it('should give high items base score of 3000', () => {
      // High priority with no deadline to avoid urgency bonus
      const item = createItem({ priority: 'high' });
      const score = calculatePriorityScore(item);
      expect(score).toBe(3000);
    });

    it('should give normal items base score of 2000', () => {
      const item = createItem({ priority: 'normal' });
      const score = calculatePriorityScore(item);
      expect(score).toBe(2000);
    });

    it('should give low items base score of 1000', () => {
      const item = createItem({ priority: 'low' });
      const score = calculatePriorityScore(item);
      expect(score).toBe(1000);
    });
  });

  describe('urgency bonus from deadline', () => {
    it('should add 5000 bonus for overdue items', () => {
      const item = createItem({
        priority: 'critical',
        end_date: hoursFromNow(-1),
      });
      const score = calculatePriorityScore(item);
      expect(score).toBe(4000 + 5000);
    });

    it('should add 2000 bonus for deadline < 24 hours', () => {
      const item = createItem({
        priority: 'critical',
        end_date: hoursFromNow(12),
      });
      const score = calculatePriorityScore(item);
      expect(score).toBe(4000 + 2000);
    });

    it('should add 1000 bonus for deadline 24-48 hours', () => {
      // Use explicit priority to control base score
      const item = createItem({ priority: 'high', end_date: hoursFromNow(36) });
      const score = calculatePriorityScore(item);
      expect(score).toBe(3000 + 1000);
    });

    it('should add 500 bonus for deadline 48-72 hours', () => {
      const item = createItem({
        priority: 'normal',
        end_date: hoursFromNow(60),
      });
      const score = calculatePriorityScore(item);
      expect(score).toBe(2000 + 500);
    });

    it('should add 200 bonus for deadline 72-168 hours (3-7 days)', () => {
      const item = createItem({
        priority: 'normal',
        end_date: hoursFromNow(100),
      });
      const score = calculatePriorityScore(item);
      expect(score).toBe(2000 + 200);
    });

    it('should add no bonus for deadline > 168 hours', () => {
      const item = createItem({
        priority: 'normal',
        end_date: daysFromNow(10),
      });
      const score = calculatePriorityScore(item);
      expect(score).toBe(2000);
    });
  });

  describe('score ordering', () => {
    it('should give higher score to higher priority items', () => {
      const critical = calculatePriorityScore(
        createItem({ priority: 'critical' })
      );
      const high = calculatePriorityScore(createItem({ priority: 'high' }));
      const normal = calculatePriorityScore(createItem({ priority: 'normal' }));
      const low = calculatePriorityScore(createItem({ priority: 'low' }));

      expect(critical).toBeGreaterThan(high);
      expect(high).toBeGreaterThan(normal);
      expect(normal).toBeGreaterThan(low);
    });

    it('should give higher score to items with closer deadlines', () => {
      const urgent = calculatePriorityScore(
        createItem({ priority: 'normal', end_date: hoursFromNow(12) })
      );
      const soon = calculatePriorityScore(
        createItem({ priority: 'normal', end_date: hoursFromNow(36) })
      );
      const later = calculatePriorityScore(
        createItem({ priority: 'normal', end_date: daysFromNow(10) })
      );

      expect(urgent).toBeGreaterThan(soon);
      expect(soon).toBeGreaterThan(later);
    });
  });
});
