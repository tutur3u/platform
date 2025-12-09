import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TAG_COLOR,
  getAvailableTagColors,
  getTagColor,
  getTagColorClass,
  getTagColorStyling,
} from '../tag-utils';

describe('Tag Utils', () => {
  describe('getTagColor', () => {
    it('returns default colors for empty string', () => {
      const result = getTagColor('');
      expect(result['--tag-bg-color']).toBe('rgb(75 85 99 / 0.2)');
      expect(result['--tag-text-color']).toBe('rgb(209 213 219)');
      expect(result['--tag-border-color']).toBe('rgb(75 85 99 / 0.4)');
    });

    it('returns default colors for null input', () => {
      const result = getTagColor(null as any);
      expect(result['--tag-bg-color']).toBe('rgb(75 85 99 / 0.2)');
    });

    it('returns default colors for undefined input', () => {
      const result = getTagColor(undefined as any);
      expect(result['--tag-bg-color']).toBe('rgb(75 85 99 / 0.2)');
    });

    it('returns consistent colors for the same tag', () => {
      const result1 = getTagColor('urgent');
      const result2 = getTagColor('urgent');
      expect(result1).toEqual(result2);
    });

    it('returns different colors for different tags', () => {
      const result1 = getTagColor('urgent');
      const result2 = getTagColor('feature');
      // At least one color should differ
      expect(
        result1['--tag-bg-color'] !== result2['--tag-bg-color'] ||
          result1['--tag-text-color'] !== result2['--tag-text-color']
      ).toBe(true);
    });

    it('returns HSL-formatted colors', () => {
      const result = getTagColor('test');
      expect(result['--tag-bg-color']).toMatch(
        /^hsl\(\d+ \d+% \d+% \/ [\d.]+\)$/
      );
      expect(result['--tag-text-color']).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
      expect(result['--tag-border-color']).toMatch(
        /^hsl\(\d+ \d+% \d+% \/ [\d.]+\)$/
      );
    });

    it('handles tags with special characters', () => {
      const result = getTagColor('tag-with-dash');
      expect(result['--tag-bg-color']).toBeDefined();
    });

    it('handles tags with numbers', () => {
      const result = getTagColor('tag123');
      expect(result['--tag-bg-color']).toBeDefined();
    });

    it('handles tags with spaces', () => {
      const result = getTagColor('tag with spaces');
      expect(result['--tag-bg-color']).toBeDefined();
    });

    it('is case insensitive for color generation', () => {
      const result1 = getTagColor('Urgent');
      const result2 = getTagColor('urgent');
      expect(result1).toEqual(result2);
    });

    it('trims whitespace for consistent hashing', () => {
      const result1 = getTagColor('  test  ');
      const result2 = getTagColor('test');
      expect(result1).toEqual(result2);
    });

    it('returns all three CSS variables', () => {
      const result = getTagColor('test');
      expect(result).toHaveProperty('--tag-bg-color');
      expect(result).toHaveProperty('--tag-text-color');
      expect(result).toHaveProperty('--tag-border-color');
    });
  });

  describe('getTagColorClass', () => {
    it('returns Tailwind classes using CSS variables', () => {
      const result = getTagColorClass();
      expect(result).toContain('bg-[var(--tag-bg-color)]');
      expect(result).toContain('text-[var(--tag-text-color)]');
      expect(result).toContain('border-[var(--tag-border-color)]');
    });

    it('returns the same class on multiple calls', () => {
      const result1 = getTagColorClass();
      const result2 = getTagColorClass();
      expect(result1).toBe(result2);
    });
  });

  describe('getTagColorStyling', () => {
    it('returns both style and className', () => {
      const result = getTagColorStyling('test');
      expect(result).toHaveProperty('style');
      expect(result).toHaveProperty('className');
    });

    it('style contains CSS variables', () => {
      const result = getTagColorStyling('test');
      expect(result.style).toHaveProperty('--tag-bg-color');
      expect(result.style).toHaveProperty('--tag-text-color');
      expect(result.style).toHaveProperty('--tag-border-color');
    });

    it('className matches getTagColorClass output', () => {
      const result = getTagColorStyling('test');
      expect(result.className).toBe(getTagColorClass());
    });

    it('style matches getTagColor output', () => {
      const result = getTagColorStyling('test');
      const colors = getTagColor('test');
      expect((result.style as Record<string, string>)['--tag-bg-color']).toBe(
        colors['--tag-bg-color']
      );
    });
  });

  describe('getAvailableTagColors', () => {
    it('returns an array of color classes', () => {
      const colors = getAvailableTagColors();
      expect(Array.isArray(colors)).toBe(true);
      expect(colors.length).toBeGreaterThan(0);
    });

    it('returns 12 predefined colors', () => {
      const colors = getAvailableTagColors();
      expect(colors).toHaveLength(12);
    });

    it('all colors follow the expected pattern', () => {
      const colors = getAvailableTagColors();
      colors.forEach((color) => {
        expect(color).toMatch(
          /^bg-\w+-\d+\/\d+ text-\w+-\d+ border-\w+-\d+\/\d+$/
        );
      });
    });

    it('includes common color names', () => {
      const colors = getAvailableTagColors();
      const colorString = colors.join(' ');
      expect(colorString).toContain('blue');
      expect(colorString).toContain('green');
      expect(colorString).toContain('red');
      expect(colorString).toContain('purple');
    });

    it('returns readonly array', () => {
      const colors = getAvailableTagColors();
      // TypeScript prevents modification, but we test the content
      expect(colors[0]).toBe('bg-blue-600/20 text-blue-300 border-blue-600/40');
    });
  });

  describe('DEFAULT_TAG_COLOR', () => {
    it('is a valid Tailwind class string', () => {
      expect(DEFAULT_TAG_COLOR).toBe(
        'bg-gray-500/20 text-gray-300 border-gray-500/30'
      );
    });

    it('uses gray color scheme', () => {
      expect(DEFAULT_TAG_COLOR).toContain('gray');
    });
  });

  describe('color distribution', () => {
    it('distributes colors reasonably for common tags', () => {
      const commonTags = [
        'bug',
        'feature',
        'urgent',
        'documentation',
        'enhancement',
        'refactor',
        'test',
        'design',
      ];

      const colors = commonTags.map(
        (tag) => getTagColor(tag)['--tag-bg-color']
      );
      const uniqueColors = new Set(colors);

      // Should have reasonable variety (at least half should be unique)
      expect(uniqueColors.size).toBeGreaterThan(commonTags.length / 2);
    });
  });
});
