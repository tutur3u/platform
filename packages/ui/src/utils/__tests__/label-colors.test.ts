import { describe, expect, it } from 'vitest';
import { computeAccessibleLabelStyles } from '../label-colors';

describe('label-colors', () => {
  describe('computeAccessibleLabelStyles', () => {
    describe('hex color inputs', () => {
      it('should handle 6-digit hex with # prefix', () => {
        const result = computeAccessibleLabelStyles('#ff0000');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#ff00001a');
        expect(result?.border).toBe('#ff00004d');
        expect(result?.text).toMatch(/^#[0-9a-f]{6}$/);
      });

      it('should handle 6-digit hex without # prefix', () => {
        const result = computeAccessibleLabelStyles('00ff00');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#00ff001a');
      });

      it('should handle 3-digit hex with # prefix', () => {
        const result = computeAccessibleLabelStyles('#f00');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#ff00001a');
      });

      it('should handle 3-digit hex without # prefix', () => {
        const result = computeAccessibleLabelStyles('0f0');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#00ff001a');
      });

      it('should handle uppercase hex', () => {
        const result = computeAccessibleLabelStyles('#FF0000');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#ff00001a');
      });

      it('should handle mixed case hex', () => {
        const result = computeAccessibleLabelStyles('#Ff00Aa');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#ff00aa1a');
      });
    });

    describe('color name inputs', () => {
      it('should resolve "red" to correct hex', () => {
        const result = computeAccessibleLabelStyles('red');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#ef44441a');
      });

      it('should resolve "blue" to correct hex', () => {
        const result = computeAccessibleLabelStyles('blue');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#3b82f61a');
      });

      it('should resolve "green" to correct hex', () => {
        const result = computeAccessibleLabelStyles('green');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#22c55e1a');
      });

      it('should resolve "yellow" to correct hex', () => {
        const result = computeAccessibleLabelStyles('yellow');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#eab3081a');
      });

      it('should resolve "purple" to correct hex', () => {
        const result = computeAccessibleLabelStyles('purple');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#a855f71a');
      });

      it('should be case-insensitive for color names', () => {
        const result1 = computeAccessibleLabelStyles('RED');
        const result2 = computeAccessibleLabelStyles('Red');
        const result3 = computeAccessibleLabelStyles('red');
        expect(result1?.bg).toBe(result2?.bg);
        expect(result2?.bg).toBe(result3?.bg);
      });

      it('should handle all tailwind color names', () => {
        const colors = [
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

        for (const color of colors) {
          const result = computeAccessibleLabelStyles(color);
          expect(result).not.toBeNull();
          expect(result?.bg).toMatch(/^#[0-9a-f]{6}1a$/);
        }
      });
    });

    describe('text color contrast adjustment', () => {
      it('should lighten dark colors for better contrast', () => {
        // Dark color with low luminance
        const result = computeAccessibleLabelStyles('#000033');
        expect(result).not.toBeNull();
        // Text should be adjusted (lighter than original)
        expect(result?.text).not.toBe('#000033');
      });

      it('should darken light colors for better contrast', () => {
        // Light color with high luminance
        const result = computeAccessibleLabelStyles('#ffffcc');
        expect(result).not.toBeNull();
        // Text should be adjusted (darker than original)
        expect(result?.text).not.toBe('#ffffcc');
      });

      it('should keep medium luminance colors unchanged', () => {
        // Medium luminance color
        const result = computeAccessibleLabelStyles('#3b82f6');
        expect(result).not.toBeNull();
        expect(result?.text).toBe('#3b82f6');
      });
    });

    describe('invalid inputs', () => {
      it('should return null for empty string', () => {
        const result = computeAccessibleLabelStyles('');
        expect(result).toBeNull();
      });

      it('should return null for invalid hex (wrong length)', () => {
        const result = computeAccessibleLabelStyles('#1234');
        expect(result).toBeNull();
      });

      it('should return null for invalid hex (non-hex chars)', () => {
        const result = computeAccessibleLabelStyles('#gggggg');
        expect(result).toBeNull();
      });

      it('should return null for unknown color names', () => {
        const result = computeAccessibleLabelStyles('notacolor');
        expect(result).toBeNull();
      });

      it('should return null for whitespace only', () => {
        const result = computeAccessibleLabelStyles('   ');
        expect(result).toBeNull();
      });
    });

    describe('output format', () => {
      it('should return bg with 1a opacity suffix', () => {
        const result = computeAccessibleLabelStyles('#ff0000');
        expect(result?.bg).toMatch(/^#[0-9a-f]{6}1a$/);
      });

      it('should return border with 4d opacity suffix', () => {
        const result = computeAccessibleLabelStyles('#ff0000');
        expect(result?.border).toMatch(/^#[0-9a-f]{6}4d$/);
      });

      it('should return text as valid hex', () => {
        const result = computeAccessibleLabelStyles('#ff0000');
        expect(result?.text).toMatch(/^#[0-9a-f]{6}$/);
      });
    });

    describe('edge cases', () => {
      it('should handle black color', () => {
        const result = computeAccessibleLabelStyles('#000000');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#0000001a');
        // Black has very low luminance, text color is computed but may remain similar
        expect(result?.text).toMatch(/^#[0-9a-f]{6}$/);
      });

      it('should handle white color', () => {
        const result = computeAccessibleLabelStyles('#ffffff');
        expect(result).not.toBeNull();
        // White should be adjusted for better contrast
        expect(result?.text).not.toBe('#ffffff');
      });

      it('should handle pure gray', () => {
        const result = computeAccessibleLabelStyles('#808080');
        expect(result).not.toBeNull();
      });

      it('should handle input with leading/trailing spaces', () => {
        const result = computeAccessibleLabelStyles('  #ff0000  ');
        expect(result).not.toBeNull();
        expect(result?.bg).toBe('#ff00001a');
      });
    });
  });
});
