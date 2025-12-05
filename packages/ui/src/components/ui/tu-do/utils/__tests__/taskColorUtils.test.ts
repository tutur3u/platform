import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { describe, expect, it } from 'vitest';
import {
  getAssigneeInitials,
  getCardColorClasses,
  getListColorClasses,
  getListTextColorClass,
  getPriorityBorderColor,
  getTicketBadgeColorClasses,
} from '../taskColorUtils';

describe('taskColorUtils', () => {
  describe('getListColorClasses', () => {
    const supportedColors: SupportedColor[] = [
      'GRAY',
      'RED',
      'BLUE',
      'GREEN',
      'YELLOW',
      'ORANGE',
      'PURPLE',
      'PINK',
      'INDIGO',
      'CYAN',
    ];

    it.each(supportedColors)('should return classes for %s color', (color) => {
      const result = getListColorClasses(color);
      expect(result).toContain('border-dynamic-');
      expect(result).toContain('bg-dynamic-');
    });

    it('should return GRAY classes for unknown colors', () => {
      const result = getListColorClasses('UNKNOWN' as SupportedColor);
      expect(result).toContain('border-dynamic-gray');
      expect(result).toContain('bg-dynamic-gray');
    });
  });

  describe('getPriorityBorderColor', () => {
    it('should return red border for critical priority', () => {
      const result = getPriorityBorderColor('critical');
      expect(result).toContain('border-dynamic-red');
      expect(result).toContain('shadow');
    });

    it('should return orange border for high priority', () => {
      const result = getPriorityBorderColor('high');
      expect(result).toContain('border-dynamic-orange');
    });

    it('should return yellow border for normal priority', () => {
      const result = getPriorityBorderColor('normal');
      expect(result).toContain('border-dynamic-yellow');
    });

    it('should return blue border for low priority', () => {
      const result = getPriorityBorderColor('low');
      expect(result).toContain('border-dynamic-blue');
    });

    it('should return empty string for null priority', () => {
      const result = getPriorityBorderColor(null);
      expect(result).toBe('');
    });

    it('should return empty string for undefined priority', () => {
      const result = getPriorityBorderColor(undefined);
      expect(result).toBe('');
    });
  });

  describe('getCardColorClasses', () => {
    it('should use task list color when available', () => {
      const taskList = {
        id: '1',
        name: 'Test',
        color: 'RED' as SupportedColor,
      };
      const result = getCardColorClasses(taskList as any, 'critical');
      expect(result).toContain('border-dynamic-red');
    });

    it('should use priority when task list has no color', () => {
      const taskList = { id: '1', name: 'Test', color: null };
      const result = getCardColorClasses(taskList as any, 'critical');
      expect(result).toContain('border-dynamic-red');
    });

    it('should use priority when task list is undefined', () => {
      const result = getCardColorClasses(undefined, 'high');
      expect(result).toContain('border-dynamic-orange');
    });

    it('should return default gray when neither list color nor priority provided', () => {
      const result = getCardColorClasses(undefined, undefined);
      expect(result).toBe('border-l-dynamic-gray/30');
    });

    it('should return default gray when both are null', () => {
      const taskList = { id: '1', name: 'Test', color: null };
      const result = getCardColorClasses(taskList as any, null);
      expect(result).toBe('border-l-dynamic-gray/30');
    });
  });

  describe('getTicketBadgeColorClasses', () => {
    it('should return GRAY badge classes by default', () => {
      const result = getTicketBadgeColorClasses();
      expect(result).toContain('border-dynamic-gray');
      expect(result).toContain('bg-dynamic-gray');
      expect(result).toContain('text-foreground');
    });

    it('should use task list color when available', () => {
      const taskList = {
        id: '1',
        name: 'Test',
        color: 'BLUE' as SupportedColor,
      };
      const result = getTicketBadgeColorClasses(taskList as any);
      expect(result).toContain('border-dynamic-blue');
      expect(result).toContain('bg-dynamic-blue');
      expect(result).toContain('text-dynamic-blue');
    });

    it('should use priority when task list is undefined', () => {
      const result = getTicketBadgeColorClasses(undefined, 'critical');
      expect(result).toContain('border-dynamic-red');
      expect(result).toContain('bg-dynamic-red');
      expect(result).toContain('text-dynamic-red');
    });

    it('should prefer task list color over priority', () => {
      const taskList = {
        id: '1',
        name: 'Test',
        color: 'GREEN' as SupportedColor,
      };
      const result = getTicketBadgeColorClasses(taskList as any, 'critical');
      expect(result).toContain('border-dynamic-green');
      expect(result).not.toContain('border-dynamic-red');
    });

    it('should return correct classes for each priority', () => {
      expect(getTicketBadgeColorClasses(undefined, 'critical')).toContain(
        'text-dynamic-red'
      );
      expect(getTicketBadgeColorClasses(undefined, 'high')).toContain(
        'text-dynamic-orange'
      );
      expect(getTicketBadgeColorClasses(undefined, 'normal')).toContain(
        'text-dynamic-yellow'
      );
      expect(getTicketBadgeColorClasses(undefined, 'low')).toContain(
        'text-dynamic-blue'
      );
    });

    it('should return GRAY classes for unknown color', () => {
      const taskList = {
        id: '1',
        name: 'Test',
        color: 'UNKNOWN' as SupportedColor,
      };
      const result = getTicketBadgeColorClasses(taskList as any);
      expect(result).toContain('border-dynamic-gray');
    });
  });

  describe('getListTextColorClass', () => {
    it('should return muted-foreground for null color', () => {
      expect(getListTextColorClass(null)).toBe('text-muted-foreground');
    });

    it('should return muted-foreground for undefined color', () => {
      expect(getListTextColorClass(undefined)).toBe('text-muted-foreground');
    });

    it('should return correct text class for each color', () => {
      const colorMap: Record<SupportedColor, string> = {
        GRAY: 'text-dynamic-gray',
        RED: 'text-dynamic-red',
        BLUE: 'text-dynamic-blue',
        GREEN: 'text-dynamic-green',
        YELLOW: 'text-dynamic-yellow',
        ORANGE: 'text-dynamic-orange',
        PURPLE: 'text-dynamic-purple',
        PINK: 'text-dynamic-pink',
        INDIGO: 'text-dynamic-indigo',
        CYAN: 'text-dynamic-cyan',
      };

      for (const [color, expectedClass] of Object.entries(colorMap)) {
        expect(getListTextColorClass(color as SupportedColor)).toBe(
          expectedClass
        );
      }
    });

    it('should return muted-foreground for unknown color', () => {
      expect(getListTextColorClass('UNKNOWN' as SupportedColor)).toBe(
        'text-muted-foreground'
      );
    });
  });

  describe('getAssigneeInitials', () => {
    describe('with name', () => {
      it('should return first two characters for single word name', () => {
        expect(getAssigneeInitials('John')).toBe('JO');
      });

      it('should return first letters of first and last name', () => {
        expect(getAssigneeInitials('John Doe')).toBe('JD');
      });

      it('should handle three-part names', () => {
        expect(getAssigneeInitials('John Michael Doe')).toBe('JD');
      });

      it('should handle extra whitespace', () => {
        expect(getAssigneeInitials('  John   Doe  ')).toBe('JD');
      });

      it('should handle single character name', () => {
        expect(getAssigneeInitials('J')).toBe('J');
      });

      it('should handle empty name with email fallback', () => {
        expect(getAssigneeInitials('', 'john@example.com')).toBe('JO');
      });
    });

    describe('with email', () => {
      it('should return first two characters of email', () => {
        expect(getAssigneeInitials(null, 'john@example.com')).toBe('JO');
      });

      it('should use email when name is null', () => {
        expect(getAssigneeInitials(null, 'test@test.com')).toBe('TE');
      });

      it('should uppercase email initials', () => {
        expect(getAssigneeInitials(null, 'ab@test.com')).toBe('AB');
      });
    });

    describe('edge cases', () => {
      it('should return ?? for null name and null email', () => {
        expect(getAssigneeInitials(null, null)).toBe('??');
      });

      it('should return ?? for undefined values', () => {
        expect(getAssigneeInitials(undefined, undefined)).toBe('??');
      });

      it('should return ?? for empty strings', () => {
        expect(getAssigneeInitials('', '')).toBe('??');
      });

      it('should handle whitespace-only name', () => {
        expect(getAssigneeInitials('   ', 'fallback@test.com')).toBe('FA');
      });
    });
  });
});
