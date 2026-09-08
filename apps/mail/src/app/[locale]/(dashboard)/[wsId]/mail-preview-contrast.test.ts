import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  mailDarkSurface,
  readableMailColor,
} from './mail-preview-contrast';

describe('mail contrast', () => {
  it('makes the navy newsletter footer readable on dark paper', () => {
    expect(
      contrastRatio(readableMailColor([16, 24, 40], [18, 18, 18]), [18, 18, 18])
    ).toBeGreaterThanOrEqual(4.5);
  });
  it('preserves already readable sender colors', () => {
    expect(readableMailColor([230, 230, 230], [18, 18, 18])).toEqual([
      230, 230, 230,
    ]);
  });
  it('keeps text readable on preserved light brand panels', () => {
    const background: [number, number, number] = [255, 220, 80];
    expect(
      contrastRatio(readableMailColor([255, 255, 255], background), background)
    ).toBeGreaterThanOrEqual(4.5);
  });
  it('matches dark reader surfaces without turning dark appearance white in a light app', () => {
    expect(mailDarkSurface([10, 10, 10])).toEqual([10, 10, 10]);
    expect(mailDarkSurface([255, 255, 255])).toEqual([18, 18, 18]);
    expect(mailDarkSurface([230, 230, 230])).toEqual([18, 18, 18]);
  });
});
