// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * The repository patches @excalidraw/excalidraw 0.18.1
 * (`patches/@excalidraw%2Fexcalidraw@0.18.1.patch`) so a cached element
 * canvas never grows past its 100%-zoom size and an arrow's label canvas
 * stays within Excalidraw's own area and side limits. These tests run the
 * sizing function of each build the app loads; after an upgrade the chunk
 * names change, these tests fail, and the patch must be re-applied and
 * re-verified.
 */
const AREA_LIMIT = 16_777_216;
const SIDE_LIMIT = 32_767;
const DPR = 2;

const packageRoot = join(
  dirname(createRequire(import.meta.url).resolve('@excalidraw/excalidraw')),
  '..',
  '..'
);

type Shape = { type: string; width: number; height: number; label?: true };
type Size = { width: number; height: number; scale: number };
type Sizing = (element: Shape, zoom: number) => Size;

/** The source of the arrow function that starts at `start` and ends at `end`. */
function slice(file: string, start: string, end: string) {
  const text = readFileSync(join(packageRoot, file), 'utf8');
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`${file}: sizing code not found`);
  return text.slice(from, to);
}

/** Runs a build's `cappedElementCanvasSize` with its helpers stubbed. */
function sizing(source: string, names: Record<string, string>): Sizing {
  const linear = (element: Shape) =>
    element.type === 'line' || element.type === 'arrow';
  const helpers: Record<string, unknown> = {
    padding: () => 20,
    coords: (element: Shape) => [0, 0, element.width, element.height],
    isLinear: linear,
    isFreeDraw: (element: Shape) => element.type === 'freedraw',
    distance: (a: number, b: number) => Math.abs(a - b),
    isArrow: (element: Shape) => element.type === 'arrow',
    boundText: (element: Shape) => (element.label ? {} : null),
  };
  const context: Record<string, unknown> = {
    window: { devicePixelRatio: DPR },
  };
  for (const [role, name] of Object.entries(names))
    context[name] = helpers[role];
  const run = runInNewContext(`(${source})`, context) as (
    element: Shape,
    map: unknown,
    zoom: { value: number }
  ) => Size;
  return (element, zoom) => run(element, new Map(), { value: zoom });
}

const builds: [string, Sizing][] = [
  [
    'dev',
    sizing(
      slice(
        'dist/dev/chunk-4FTI6OG3.js',
        '(element, elementsMap, zoom) => {\n  const AREA_LIMIT',
        '\n};\nvar generateElementCanvas'
      ) + '\n}',
      {
        padding: 'getCanvasPadding',
        coords: 'getElementAbsoluteCoords',
        isLinear: 'isLinearElement',
        isFreeDraw: 'isFreeDrawElement',
        distance: 'distance',
        isArrow: 'isArrowElement',
        boundText: 'getBoundTextElement',
      }
    ),
  ],
  [
    'prod',
    sizing(
      `${slice('dist/prod/chunk-K2UTITRG.js', '(e,t,n)=>{let i=ri(e)', '},K1=')}}`,
      {
        padding: 'ri',
        coords: 'C',
        isLinear: 'ae',
        isFreeDraw: 'Ce',
        distance: 'dt',
        isArrow: 'ee',
        boundText: 'oe',
      }
    ),
  ],
];

describe.each(builds)('patched Excalidraw %s canvas sizing', (_, size) => {
  const area = ({ width, height }: Size) => width * height;

  it.each([2, 3])(
    'keeps a cached canvas at its 100 percent size at zoom %d',
    (z) => {
      const box = { type: 'rectangle', width: 1000, height: 1000 };
      const full = size(box, 1);
      expect(full.width).toBe(1000 * DPR + 40);
      expect(area(size(box, z))).toBeLessThanOrEqual(area(full));
      expect(size(box, z).scale).toBe(1);
    }
  );

  it.each([1, 2, 3])('fits a label canvas inside the cap at zoom %d', (z) => {
    const arrow = {
      type: 'arrow',
      width: 16_000,
      height: 0,
      label: true as const,
    };
    const { scale } = size(arrow, z);
    // generateElementCanvas: maxDim · dpr · scale + padding · scale · 10.
    const side = (16_000 * DPR + 20 * 10) * scale;
    expect(side).toBeLessThanOrEqual(SIDE_LIMIT);
    expect(side * side).toBeLessThanOrEqual(AREA_LIMIT);
  });

  it('leaves an unlabelled arrow and a small zoomed-out shape alone', () => {
    const arrow = { type: 'arrow', width: 16_000, height: 0 };
    expect(size(arrow, 1).scale).toBe(1);
    const box = { type: 'rectangle', width: 200, height: 100 };
    expect(size(box, 0.5).scale).toBe(0.5);
  });
});
