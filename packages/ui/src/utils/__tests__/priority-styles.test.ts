import { describe, expect, it } from 'vitest';
import { getPriorityBadgeStyles, getPriorityLabel } from '../priority-styles';

describe('priority-styles', () => {
  describe('getPriorityBadgeStyles', () => {
    it('should return critical priority styles', () => {
      const result = getPriorityBadgeStyles('critical');
      expect(result).toContain('border-dynamic-red');
      expect(result).toContain('bg-dynamic-red');
      expect(result).toContain('text-dynamic-red');
    });

    it('should return high priority styles', () => {
      const result = getPriorityBadgeStyles('high');
      expect(result).toContain('border-dynamic-orange');
      expect(result).toContain('bg-dynamic-orange');
      expect(result).toContain('text-dynamic-orange');
    });

    it('should return normal priority styles', () => {
      const result = getPriorityBadgeStyles('normal');
      expect(result).toContain('border-dynamic-yellow');
      expect(result).toContain('bg-dynamic-yellow');
      expect(result).toContain('text-dynamic-yellow');
    });

    it('should return low priority styles', () => {
      const result = getPriorityBadgeStyles('low');
      expect(result).toContain('border-dynamic-blue');
      expect(result).toContain('bg-dynamic-blue');
      expect(result).toContain('text-dynamic-blue');
    });

    it('should return default styles for null priority', () => {
      const result = getPriorityBadgeStyles(null);
      expect(result).toContain('border-border');
      expect(result).toContain('bg-background');
      expect(result).toContain('text-muted-foreground');
    });

    it('should include hover states for all priorities', () => {
      const priorities = ['critical', 'high', 'normal', 'low'] as const;
      for (const priority of priorities) {
        const result = getPriorityBadgeStyles(priority);
        expect(result).toContain('hover:');
      }
    });

    it('should include hover states for null priority', () => {
      const result = getPriorityBadgeStyles(null);
      expect(result).toContain('hover:');
    });
  });

  describe('getPriorityLabel', () => {
    it('should return "Urgent" for critical priority', () => {
      expect(getPriorityLabel('critical')).toBe('Urgent');
    });

    it('should return "High" for high priority', () => {
      expect(getPriorityLabel('high')).toBe('High');
    });

    it('should return "Medium" for normal priority', () => {
      expect(getPriorityLabel('normal')).toBe('Medium');
    });

    it('should return "Low" for low priority', () => {
      expect(getPriorityLabel('low')).toBe('Low');
    });

    it('should return consistent labels across multiple calls', () => {
      const firstCall = getPriorityLabel('critical');
      const secondCall = getPriorityLabel('critical');
      expect(firstCall).toBe(secondCall);
    });
  });
});
