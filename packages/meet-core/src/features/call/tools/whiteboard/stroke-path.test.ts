import { expect, it } from 'vitest';
import { pressureWidth, type WhiteboardPoint } from './stroke';
import { strokePathChunks } from './stroke-path';

const point = (x: number, y: number, pressure = 0.5): WhiteboardPoint => ({
  x,
  y,
  pressure,
  tiltX: 0,
  tiltY: 0,
  t: 0,
});

it('draws a dot whose radius follows the pressure', () => {
  expect(pressureWidth(6, 0)).toBe(1.5);
  expect(pressureWidth(6, 0.5)).toBe(6);
  expect(pressureWidth(6, 1)).toBe(10.5);
  expect(pressureWidth(6, 4)).toBe(10.5);

  expect(strokePathChunks([point(100, 50, 1)], 6)).toEqual([
    'M94.75 50a5.25 5.25 0 1 0 10.5 0a5.25 5.25 0 1 0 -10.5 0z',
  ]);
  expect(strokePathChunks([point(100, 50, 0)], 6)).toEqual([
    'M99.25 50a0.75 0.75 0 1 0 1.5 0a0.75 0.75 0 1 0 -1.5 0z',
  ]);
  expect(strokePathChunks([], 6)).toEqual([]);
});

it('spans each disc by exactly twice its radius', () => {
  // A radius over half the span would draw the disc off-centre.
  for (let step = 0; step <= 1000; step++) {
    const [path] = strokePathChunks([point(33.3, 71.7, step / 1000)], 7.3);
    const [, radius, span, back] =
      path?.match(
        /^M\S+ \S+a(\S+) \S+ 0 1 0 (\S+) 0a\S+ \S+ 0 1 0 (\S+) 0z$/
      ) ?? [];
    expect(Number(span)).toBeCloseTo(Number(radius) * 2, 9);
    expect(Number(back)).toBe(-Number(span));
    expect(Number(path?.slice(1).split(' ')[0])).toBeCloseTo(
      33.3 - Number(radius),
      9
    );
  }
});

it('joins two points of one width with a straight body', () => {
  const [path] = strokePathChunks([point(0, 0), point(10, 0)], 6);
  expect(path).toContain('M0 3L10 3L10 -3L0 -3z');
  // Two points at one place need no body between them.
  expect(strokePathChunks([point(5, 5), point(5, 5)], 6)[0]).not.toContain('L');
  // Nor does a point whose disc already covers its neighbour.
  expect(
    strokePathChunks([point(5, 5, 1), point(7, 5, 0)], 6)[0]
  ).not.toContain('L');
});

it('tapers the body along the lines that touch both discs', () => {
  const from = { x: 20, y: 30, radius: pressureWidth(6, 0.2) / 2 };
  const to = { x: 60, y: 50, radius: pressureWidth(6, 1) / 2 };
  const [path] = strokePathChunks(
    [point(from.x, from.y, 0.2), point(to.x, to.y, 1)],
    6
  );
  const body = path?.match(/M([^Maz]+)L([^L]+)L([^L]+)L([^Lz]+)z/);
  const corners = (body?.slice(1) ?? []).map((pair) => {
    const [x = Number.NaN, y = Number.NaN] = pair.split(' ').map(Number);
    return { x, y };
  });
  const [fromA, toA, toB, fromB] = corners;
  if (!fromA || !toA || !toB || !fromB) throw new Error('body not found');
  for (const [start, end] of [
    [fromA, toA],
    [fromB, toB],
  ] as const) {
    // Each edge starts on the light disc and ends on the heavy one.
    expect(Math.hypot(start.x - from.x, start.y - from.y)).toBeCloseTo(
      from.radius,
      1
    );
    expect(Math.hypot(end.x - to.x, end.y - to.y)).toBeCloseTo(to.radius, 1);
    // It meets the disc at a right angle to the radius, so nothing pokes out.
    const turn =
      (end.x - start.x) * (end.y - to.y) - (end.y - start.y) * (end.x - to.x);
    expect(Math.abs(turn)).toBeCloseTo(
      Math.hypot(end.x - start.x, end.y - start.y) * to.radius,
      0
    );
  }
});

it('rewrites only the last chunk as a stroke grows', () => {
  const points = Array.from({ length: 5 }, (_, index) => point(index * 10, 0));
  const before = strokePathChunks(points, 6, 2);
  const after = strokePathChunks([...points, point(50, 0)], 6, 2);
  expect(before).toHaveLength(3);
  expect(after).toHaveLength(3);
  expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
  expect(after[2]).not.toBe(before[2]);
});
