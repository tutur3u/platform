import { describe, expect, it } from 'vitest';
import {
  getRandomLabelColor,
  getRandomLabelColorFromPalette,
  LABEL_COLOR_PRESETS,
} from '../label-colors';

describe('label color utilities', () => {
  it('defines valid hex label presets', () => {
    expect(LABEL_COLOR_PRESETS.length).toBeGreaterThan(1);

    for (const color of LABEL_COLOR_PRESETS) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('chooses a color from the preset palette', () => {
    const color = getRandomLabelColor(undefined, () => 0.4);

    expect(LABEL_COLOR_PRESETS).toContain(color);
  });

  it('avoids the previous color when another preset is available', () => {
    const previousColor = LABEL_COLOR_PRESETS[0];
    const color = getRandomLabelColor(previousColor, () => 0);

    expect(color).not.toBe(previousColor);
    expect(LABEL_COLOR_PRESETS).toContain(color);
  });

  it('compares previous colors case-insensitively', () => {
    const previousColor = LABEL_COLOR_PRESETS[0]?.toLowerCase();
    const color = getRandomLabelColor(previousColor, () => 0);

    expect(color).not.toBe(LABEL_COLOR_PRESETS[0]);
  });

  it('falls back when a custom palette is empty', () => {
    expect(getRandomLabelColorFromPalette([], undefined, () => 0)).toBe(
      '#3B82F6'
    );
  });
});
