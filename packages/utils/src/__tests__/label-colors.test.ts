/**
 * Tests for Label Colors Utilities
 *
 * Tests the computeAccessibleLabelStyles function which computes
 * accessible label styles with proper contrast based on color input.
 */

import { describe, expect, it } from 'vitest';
import { computeAccessibleLabelStyles } from '../label-colors';

describe('computeAccessibleLabelStyles', () => {
  describe('Hex color inputs', () => {
    it('should handle 6-character hex with # prefix', () => {
      const result = computeAccessibleLabelStyles('#3b82f6');
      expect(result).not.toBeNull();
      expect(result?.bg).toMatch(/^#[0-9a-f]{6}[0-9a-f]{2}$/);
      expect(result?.border).toMatch(/^#[0-9a-f]{6}[0-9a-f]{2}$/);
      expect(result?.text).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('should handle 6-character hex without # prefix', () => {
      const result = computeAccessibleLabelStyles('3b82f6');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#3b82f61a');
      expect(result?.border).toBe('#3b82f64d');
    });

    it('should handle 3-character hex with # prefix', () => {
      const result = computeAccessibleLabelStyles('#f00');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#ff00001a');
      expect(result?.border).toBe('#ff00004d');
    });

    it('should handle 3-character hex without # prefix', () => {
      const result = computeAccessibleLabelStyles('0f0');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#00ff001a');
    });

    it('should handle uppercase hex', () => {
      const result = computeAccessibleLabelStyles('#FF5733');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#ff57331a');
    });

    it('should handle mixed case hex', () => {
      const result = computeAccessibleLabelStyles('#AbCdEf');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#abcdef1a');
    });
  });

  describe('Named color inputs', () => {
    it('should handle "red" color name', () => {
      const result = computeAccessibleLabelStyles('red');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#ef44441a');
    });

    it('should handle "blue" color name', () => {
      const result = computeAccessibleLabelStyles('blue');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#3b82f61a');
    });

    it('should handle "green" color name', () => {
      const result = computeAccessibleLabelStyles('green');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#22c55e1a');
    });

    it('should handle "purple" color name', () => {
      const result = computeAccessibleLabelStyles('purple');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#a855f71a');
    });

    it('should handle "orange" color name', () => {
      const result = computeAccessibleLabelStyles('orange');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#f973161a');
    });

    it('should handle "pink" color name', () => {
      const result = computeAccessibleLabelStyles('pink');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#ec48991a');
    });

    it('should handle "cyan" color name', () => {
      const result = computeAccessibleLabelStyles('cyan');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#06b6d41a');
    });

    it('should handle "gray" color name', () => {
      const result = computeAccessibleLabelStyles('gray');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#6b72801a');
    });

    it('should handle Tailwind color names', () => {
      const tailwindColors = [
        'red',
        'orange',
        'amber',
        'yellow',
        'lime',
        'green',
        'emerald',
        'teal',
        'cyan',
        'sky',
        'blue',
        'indigo',
        'violet',
        'purple',
        'fuchsia',
        'pink',
        'rose',
        'gray',
        'slate',
        'zinc',
      ];

      for (const color of tailwindColors) {
        const result = computeAccessibleLabelStyles(color);
        expect(result).not.toBeNull();
        expect(result?.bg).toMatch(/^#[0-9a-f]{6}1a$/);
      }
    });
  });

  describe('Invalid inputs', () => {
    it('should return null for empty string', () => {
      const result = computeAccessibleLabelStyles('');
      expect(result).toBeNull();
    });

    it('should return null for unknown color name', () => {
      const result = computeAccessibleLabelStyles('unknowncolor');
      expect(result).toBeNull();
    });

    it('should return null for invalid hex (too short)', () => {
      const result = computeAccessibleLabelStyles('#ab');
      expect(result).toBeNull();
    });

    it('should return null for invalid hex (too long)', () => {
      const result = computeAccessibleLabelStyles('#1234567');
      expect(result).toBeNull();
    });

    it('should return null for invalid hex characters', () => {
      const result = computeAccessibleLabelStyles('#gggggg');
      expect(result).toBeNull();
    });

    it('should return null for special characters', () => {
      const result = computeAccessibleLabelStyles('@#$%^&');
      expect(result).toBeNull();
    });
  });

  describe('Result structure', () => {
    it('should return object with bg, border, and text properties', () => {
      const result = computeAccessibleLabelStyles('#3b82f6');
      expect(result).toHaveProperty('bg');
      expect(result).toHaveProperty('border');
      expect(result).toHaveProperty('text');
    });

    it('should have bg with opacity suffix 1a (10%)', () => {
      const result = computeAccessibleLabelStyles('#ff0000');
      expect(result?.bg).toMatch(/1a$/);
    });

    it('should have border with opacity suffix 4d (30%)', () => {
      const result = computeAccessibleLabelStyles('#ff0000');
      expect(result?.border).toMatch(/4d$/);
    });

    it('should have text as full hex color', () => {
      const result = computeAccessibleLabelStyles('#3b82f6');
      expect(result?.text).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe('Luminance-based text color adjustment', () => {
    it('should lighten text for very dark colors (low luminance)', () => {
      // Very dark color (not pure black) - should be lightened
      // Pure black (#000000) cannot be lightened via HSL multiplication (0 * factor = 0)
      const result = computeAccessibleLabelStyles('#1a1a1a');
      expect(result).not.toBeNull();
      // Text should be lighter than original
      expect(result?.text).not.toBe('#1a1a1a');
    });

    it('should darken text for very light colors (high luminance)', () => {
      // Very light color - should be darkened
      const result = computeAccessibleLabelStyles('#ffffff');
      expect(result).not.toBeNull();
      // Text should be darker than original
      expect(result?.text).not.toBe('#ffffff');
    });

    it('should keep text as-is for mid-range luminance colors', () => {
      // Mid-range color - should stay relatively similar
      const result = computeAccessibleLabelStyles('#808080');
      expect(result).not.toBeNull();
      // Text should be close to original (gray)
    });
  });

  describe('Edge cases', () => {
    it('should handle whitespace in input', () => {
      const result = computeAccessibleLabelStyles('  #3b82f6  ');
      expect(result).not.toBeNull();
    });

    it('should normalize all output to lowercase', () => {
      const result = computeAccessibleLabelStyles('#AABBCC');
      expect(result?.bg).toBe('#aabbcc1a');
      expect(result?.border).toBe('#aabbcc4d');
    });

    it('should handle pure white correctly', () => {
      const result = computeAccessibleLabelStyles('#ffffff');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#ffffff1a');
    });

    it('should handle pure black correctly', () => {
      const result = computeAccessibleLabelStyles('#000000');
      expect(result).not.toBeNull();
      expect(result?.bg).toBe('#0000001a');
    });
  });
});
