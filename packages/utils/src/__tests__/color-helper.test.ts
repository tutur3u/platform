/**
 * Tests for Color Helper Utilities
 *
 * Tests the getEventStyles function which returns Tailwind CSS classes
 * for calendar event styling based on color input.
 */

import { describe, expect, it } from 'vitest';
import { getEventStyles } from '../color-helper';

describe('getEventStyles', () => {
  describe('Known colors', () => {
    it('should return correct styles for BLUE', () => {
      const styles = getEventStyles('BLUE');
      expect(styles.bg).toContain('bg-calendar-bg-blue');
      expect(styles.border).toContain('border-dynamic-light-blue');
      expect(styles.text).toContain('text-dynamic-light-blue');
      expect(styles.dragBg).toBe('bg-calendar-bg-blue');
      expect(styles.syncingBg).toBe('bg-calendar-bg-blue');
      expect(styles.successBg).toBe('bg-calendar-bg-blue');
      expect(styles.errorBg).toBe('bg-calendar-bg-red');
    });

    it('should return correct styles for RED', () => {
      const styles = getEventStyles('RED');
      expect(styles.bg).toContain('bg-calendar-bg-red');
      expect(styles.border).toContain('border-dynamic-light-red');
      expect(styles.text).toContain('text-dynamic-light-red');
    });

    it('should return correct styles for GREEN', () => {
      const styles = getEventStyles('GREEN');
      expect(styles.bg).toContain('bg-calendar-bg-green');
      expect(styles.border).toContain('border-dynamic-light-green');
      expect(styles.text).toContain('text-dynamic-light-green');
    });

    it('should return correct styles for YELLOW', () => {
      const styles = getEventStyles('YELLOW');
      expect(styles.bg).toContain('bg-calendar-bg-yellow');
      expect(styles.border).toContain('border-dynamic-light-yellow');
      expect(styles.text).toContain('text-dynamic-light-yellow');
    });

    it('should return correct styles for PURPLE', () => {
      const styles = getEventStyles('PURPLE');
      expect(styles.bg).toContain('bg-calendar-bg-purple');
      expect(styles.border).toContain('border-dynamic-light-purple');
      expect(styles.text).toContain('text-dynamic-light-purple');
    });

    it('should return correct styles for PINK', () => {
      const styles = getEventStyles('PINK');
      expect(styles.bg).toContain('bg-calendar-bg-pink');
      expect(styles.border).toContain('border-dynamic-light-pink');
      expect(styles.text).toContain('text-dynamic-light-pink');
    });

    it('should return correct styles for ORANGE', () => {
      const styles = getEventStyles('ORANGE');
      expect(styles.bg).toContain('bg-calendar-bg-orange');
      expect(styles.border).toContain('border-dynamic-light-orange');
      expect(styles.text).toContain('text-dynamic-light-orange');
    });

    it('should return correct styles for INDIGO', () => {
      const styles = getEventStyles('INDIGO');
      expect(styles.bg).toContain('bg-calendar-bg-indigo');
      expect(styles.border).toContain('border-dynamic-light-indigo');
      expect(styles.text).toContain('text-dynamic-light-indigo');
    });

    it('should return correct styles for CYAN', () => {
      const styles = getEventStyles('CYAN');
      expect(styles.bg).toContain('bg-calendar-bg-cyan');
      expect(styles.border).toContain('border-dynamic-light-cyan');
      expect(styles.text).toContain('text-dynamic-light-cyan');
    });

    it('should return correct styles for GRAY', () => {
      const styles = getEventStyles('GRAY');
      expect(styles.bg).toContain('bg-calendar-bg-gray');
      expect(styles.border).toContain('border-dynamic-light-gray');
      expect(styles.text).toContain('text-dynamic-light-gray');
    });
  });

  describe('Case normalization', () => {
    it('should handle lowercase color names', () => {
      const styles = getEventStyles('blue');
      expect(styles.bg).toContain('bg-calendar-bg-blue');
    });

    it('should handle mixed case color names', () => {
      const styles = getEventStyles('Blue');
      expect(styles.bg).toContain('bg-calendar-bg-blue');
    });

    it('should handle lowercase purple', () => {
      const styles = getEventStyles('purple');
      expect(styles.bg).toContain('bg-calendar-bg-purple');
    });
  });

  describe('Invalid/unknown colors', () => {
    it('should return BLUE styles for unknown color', () => {
      const styles = getEventStyles('UNKNOWN');
      expect(styles.bg).toContain('bg-calendar-bg-blue');
      expect(styles.text).toContain('text-dynamic-light-blue');
    });

    it('should return BLUE styles for empty string', () => {
      const styles = getEventStyles('');
      expect(styles.bg).toContain('bg-calendar-bg-blue');
    });

    it('should return BLUE styles for null/undefined', () => {
      const styles = getEventStyles(null as any);
      expect(styles.bg).toContain('bg-calendar-bg-blue');

      const styles2 = getEventStyles(undefined as any);
      expect(styles2.bg).toContain('bg-calendar-bg-blue');
    });
  });

  describe('Return structure', () => {
    it('should return object with all required properties', () => {
      const styles = getEventStyles('BLUE');
      expect(styles).toHaveProperty('bg');
      expect(styles).toHaveProperty('border');
      expect(styles).toHaveProperty('text');
      expect(styles).toHaveProperty('dragBg');
      expect(styles).toHaveProperty('syncingBg');
      expect(styles).toHaveProperty('successBg');
      expect(styles).toHaveProperty('errorBg');
    });

    it('should return string values for all properties', () => {
      const styles = getEventStyles('GREEN');
      expect(typeof styles.bg).toBe('string');
      expect(typeof styles.border).toBe('string');
      expect(typeof styles.text).toBe('string');
      expect(typeof styles.dragBg).toBe('string');
      expect(typeof styles.syncingBg).toBe('string');
      expect(typeof styles.successBg).toBe('string');
      expect(typeof styles.errorBg).toBe('string');
    });

    it('should always have errorBg as red', () => {
      const colors = [
        'BLUE',
        'GREEN',
        'YELLOW',
        'PURPLE',
        'PINK',
        'ORANGE',
        'INDIGO',
        'CYAN',
        'GRAY',
      ];
      for (const color of colors) {
        const styles = getEventStyles(color);
        expect(styles.errorBg).toBe('bg-calendar-bg-red');
      }
    });
  });

  describe('Hover styles', () => {
    it('should include hover ring styles in bg property', () => {
      const styles = getEventStyles('BLUE');
      expect(styles.bg).toContain('hover:ring-dynamic-light-blue');
    });

    it('should have opacity modifier in border', () => {
      const styles = getEventStyles('RED');
      expect(styles.border).toContain('/80');
    });
  });
});
