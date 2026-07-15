import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { describe, expect, it } from 'vitest';
import {
  DESTINATION_TONE_COLORS,
  DRAFT_SAVE_DEBOUNCE,
  LIST_COLOR_CLASSES,
  MENU_GUARD_TIME,
  MOBILE_BREAKPOINT,
  NEW_LABEL_COLOR,
  PRIORITY_BADGE_COLORS,
  PRIORITY_BORDER_COLORS,
  PRIORITY_LABELS,
  SUGGESTION_MENU_WIDTH,
} from '../taskConstants';

describe('taskConstants', () => {
  describe('NEW_LABEL_COLOR', () => {
    it('should be a valid hex color', () => {
      expect(NEW_LABEL_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it('should be blue (#3b82f6)', () => {
      expect(NEW_LABEL_COLOR).toBe('#3b82f6');
    });
  });

  describe('PRIORITY_LABELS', () => {
    it('should have all priority levels', () => {
      expect(PRIORITY_LABELS).toHaveProperty('critical');
      expect(PRIORITY_LABELS).toHaveProperty('high');
      expect(PRIORITY_LABELS).toHaveProperty('normal');
      expect(PRIORITY_LABELS).toHaveProperty('low');
    });

    it('should have user-friendly labels', () => {
      expect(PRIORITY_LABELS.critical).toBe('Urgent');
      expect(PRIORITY_LABELS.high).toBe('High');
      expect(PRIORITY_LABELS.normal).toBe('Medium');
      expect(PRIORITY_LABELS.low).toBe('Low');
    });
  });

  describe('LIST_COLOR_CLASSES', () => {
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

    it('should have all supported colors', () => {
      for (const color of supportedColors) {
        expect(LIST_COLOR_CLASSES).toHaveProperty(color);
      }
    });

    it('should include border classes for each color', () => {
      for (const color of supportedColors) {
        expect(LIST_COLOR_CLASSES[color]).toContain('border-dynamic-');
      }
    });

    it('should include background classes for each color', () => {
      for (const color of supportedColors) {
        expect(LIST_COLOR_CLASSES[color]).toContain('bg-dynamic-');
      }
    });
  });

  describe('PRIORITY_BORDER_COLORS', () => {
    it('should have all priority levels', () => {
      expect(PRIORITY_BORDER_COLORS).toHaveProperty('critical');
      expect(PRIORITY_BORDER_COLORS).toHaveProperty('high');
      expect(PRIORITY_BORDER_COLORS).toHaveProperty('normal');
      expect(PRIORITY_BORDER_COLORS).toHaveProperty('low');
    });

    it('should have border classes for each priority', () => {
      expect(PRIORITY_BORDER_COLORS.critical).toContain('border-dynamic-red');
      expect(PRIORITY_BORDER_COLORS.high).toContain('border-dynamic-orange');
      expect(PRIORITY_BORDER_COLORS.normal).toContain('border-dynamic-yellow');
      expect(PRIORITY_BORDER_COLORS.low).toContain('border-dynamic-blue');
    });

    it('should have shadow for critical priority', () => {
      expect(PRIORITY_BORDER_COLORS.critical).toContain('shadow');
    });
  });

  describe('PRIORITY_BADGE_COLORS', () => {
    it('should have all priority levels', () => {
      expect(PRIORITY_BADGE_COLORS).toHaveProperty('critical');
      expect(PRIORITY_BADGE_COLORS).toHaveProperty('high');
      expect(PRIORITY_BADGE_COLORS).toHaveProperty('normal');
      expect(PRIORITY_BADGE_COLORS).toHaveProperty('low');
    });

    it('should have background classes', () => {
      expect(PRIORITY_BADGE_COLORS.critical).toContain('bg-dynamic-red');
      expect(PRIORITY_BADGE_COLORS.high).toContain('bg-dynamic-orange');
      expect(PRIORITY_BADGE_COLORS.normal).toContain('bg-dynamic-yellow');
      expect(PRIORITY_BADGE_COLORS.low).toContain('bg-dynamic-blue');
    });

    it('should have text color classes', () => {
      expect(PRIORITY_BADGE_COLORS.critical).toContain('text-dynamic-red');
      expect(PRIORITY_BADGE_COLORS.high).toContain('text-dynamic-orange');
      expect(PRIORITY_BADGE_COLORS.normal).toContain('text-dynamic-yellow');
      expect(PRIORITY_BADGE_COLORS.low).toContain('text-dynamic-blue');
    });

    it('should have border classes', () => {
      expect(PRIORITY_BADGE_COLORS.critical).toContain('border-dynamic-red');
      expect(PRIORITY_BADGE_COLORS.high).toContain('border-dynamic-orange');
      expect(PRIORITY_BADGE_COLORS.normal).toContain('border-dynamic-yellow');
      expect(PRIORITY_BADGE_COLORS.low).toContain('border-dynamic-blue');
    });
  });

  describe('DESTINATION_TONE_COLORS', () => {
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

    it('should have all supported colors', () => {
      for (const color of supportedColors) {
        expect(DESTINATION_TONE_COLORS).toHaveProperty(color);
      }
    });

    it('should have background classes', () => {
      for (const color of supportedColors) {
        expect(DESTINATION_TONE_COLORS[color]).toContain('bg-dynamic-');
      }
    });

    it('should have ring classes', () => {
      for (const color of supportedColors) {
        expect(DESTINATION_TONE_COLORS[color]).toContain('ring-dynamic-');
      }
    });
  });

  describe('Timing constants', () => {
    it('MENU_GUARD_TIME should be 300ms', () => {
      expect(MENU_GUARD_TIME).toBe(300);
    });

    it('DRAFT_SAVE_DEBOUNCE should be 300ms', () => {
      expect(DRAFT_SAVE_DEBOUNCE).toBe(300);
    });
  });

  describe('Layout constants', () => {
    it('SUGGESTION_MENU_WIDTH should be 360px', () => {
      expect(SUGGESTION_MENU_WIDTH).toBe(360);
    });

    it('MOBILE_BREAKPOINT should be 768px', () => {
      expect(MOBILE_BREAKPOINT).toBe(768);
    });
  });
});
