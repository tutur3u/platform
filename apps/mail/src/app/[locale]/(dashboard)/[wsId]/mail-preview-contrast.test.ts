import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  mailBorderColor,
  mailDarkSurface,
  neutralMailSurface,
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

describe('neutral email surfaces and borders', () => {
  it('recognizes black, gray and white panels without flattening brand colors', () => {
    for (const color of [
      [0, 0, 0],
      [128, 128, 128],
      [255, 255, 255],
    ] as [number, number, number][])
      expect(neutralMailSurface(color)).toBe(true);
    expect(neutralMailSurface([0, 80, 180])).toBe(false);
  });
  it('softens bright neutral borders while retaining subtle and colored dividers', () => {
    const surface: [number, number, number] = [10, 10, 10];
    const border = mailBorderColor([255, 255, 255], surface);
    expect(contrastRatio(border, surface)).toBeGreaterThan(1.5);
    expect(contrastRatio(border, surface)).toBeLessThan(3);
    expect(mailBorderColor([40, 40, 40], surface)).toEqual([40, 40, 40]);
    expect(mailBorderColor([0, 80, 180], surface)).toEqual([0, 80, 180]);
  });
});
