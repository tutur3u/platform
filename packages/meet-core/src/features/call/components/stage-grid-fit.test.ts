import { expect, it } from 'vitest';
import { fitTileGrid } from './stage-grid-fit';

const fit = (count: number, width: number, height: number, minWidth = 0) =>
  fitTileGrid({ count, width, height, gap: 12, minWidth });

it('fills a wide stage with one large tile for a single participant', () => {
  expect(fit(1, 1600, 800)).toMatchObject({
    columns: 1,
    rows: 1,
    tileHeight: 799,
    tileWidth: 1422,
    scroll: false,
  });
});

it('picks the column count that gives the largest 16:9 tiles', () => {
  expect(fit(2, 1600, 800)).toMatchObject({ columns: 2, rows: 1 });
  expect(fit(2, 600, 1000)).toMatchObject({ columns: 1, rows: 2 });
  const four = fit(4, 1600, 900);
  expect(four).toMatchObject({ columns: 2, rows: 2, scroll: false });
});

it('never lets tiles exceed the stage in either direction', () => {
  for (const count of [1, 2, 3, 5, 7, 9, 12])
    for (const [width, height] of [
      [1920, 1080],
      [900, 500],
      [360, 640],
      [1200, 300],
    ]) {
      const result = fit(count, width, height);
      expect(result).not.toBeNull();
      if (!result) continue;
      expect(
        result.columns * result.tileWidth + 12 * (result.columns - 1)
      ).toBeLessThanOrEqual(width);
      expect(
        result.rows * result.tileHeight + 12 * (result.rows - 1)
      ).toBeLessThanOrEqual(height);
    }
});

it('keeps the minimum tile width and scrolls when the stage is too small', () => {
  const result = fit(12, 300, 200, 120);
  expect(result).toMatchObject({ columns: 2, scroll: true });
  expect(result?.tileWidth).toBeGreaterThanOrEqual(120);
  expect(fit(12, 100, 200, 160)).toMatchObject({
    columns: 1,
    scroll: true,
    tileWidth: 160,
  });
});

it('reports no fit before the stage has a size or without tiles', () => {
  expect(fit(3, 0, 600)).toBeNull();
  expect(fit(3, 800, 0)).toBeNull();
  expect(fit(0, 800, 600)).toBeNull();
});
