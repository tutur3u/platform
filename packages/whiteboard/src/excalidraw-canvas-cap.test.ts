// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * The repository patches @excalidraw/excalidraw 0.18.1
 * (`patches/@excalidraw%2Fexcalidraw@0.18.1.patch`) so that:
 * - a cached element canvas never grows past its 100%-zoom size, except an
 *   image's, and an arrow's label canvas stays within Excalidraw's own area
 *   and side limits;
 * - a cached canvas is rebuilt only when its effective scale changes;
 * - drawing a cached canvas copies only what lands on the visible canvas.
 * These tests run that code from each build the app loads. After an upgrade
 * the chunk names change and these tests fail: re-apply the patch and update
 * the chunk and helper names here.
 */
const AREA_LIMIT = 16_777_216;
const SIDE_LIMIT = 32_767;
const DPR = 2;

const packageRoot = join(
  dirname(createRequire(import.meta.url).resolve('@excalidraw/excalidraw')),
  '..',
  '..'
);

type Shape = {
  type: string;
  width: number;
  height: number;
  angle?: number;
  label?: true;
};
type Size = { width: number; height: number; scale: number };

/** Source starting at `start`, up to `end`, closed with `close`. */
function slice(file: string, start: string, end: string, close = '') {
  const text = readFileSync(join(packageRoot, file), 'utf8');
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`${file}: patched code not found`);
  return text.slice(from, to) + close;
}

const BUILDS = [
  {
    build: 'dev',
    file: 'dist/dev/chunk-4FTI6OG3.js',
    sizing: [
      '(element, elementsMap, zoom) => {\n  const AREA_LIMIT',
      '\n};\nvar generateElementCanvas',
      '\n}',
    ],
    cache: [
      '(element, elementsMap, renderConfig, appState) => {\n  const zoom',
      '\n};\nvar drawElementFromCanvas',
      '\n}',
    ],
    names: {
      sizing: 'cappedElementCanvasSize',
      generate: 'generateElementCanvas',
      store: 'elementWithCanvasCache',
      defaults: 'defaultAppState',
      padding: 'getCanvasPadding',
      coords: 'getElementAbsoluteCoords',
      isLinear: 'isLinearElement',
      isFreeDraw: 'isFreeDrawElement',
      distance: 'distance',
      isArrow: 'isArrowElement',
      isImage: 'isImageElement',
      boundText: 'getBoundTextElement',
      frame: 'getContainingFrame',
    },
  },
  {
    build: 'prod',
    file: 'dist/prod/chunk-K2UTITRG.js',
    sizing: ['(e,t,n)=>{let i=ri(e)', '},K1=', '}'],
    cache: ['(e,t,n,r)=>{let o=n?r.zoom', '},ya=', '}'],
    names: {
      sizing: 'Nm',
      generate: 'K1',
      store: 'Jo',
      defaults: '$m',
      padding: 'ri',
      coords: 'C',
      isLinear: 'ae',
      isFreeDraw: 'Ce',
      distance: 'dt',
      isArrow: 'ee',
      isImage: 'Ye',
      boundText: 'oe',
      frame: 'We',
    },
  },
] as const;

type Build = (typeof BUILDS)[number];

/** A build's sizing and cache functions, run with their helpers stubbed. */
function load({ file, sizing, cache, names }: Build) {
  let builds = 0;
  const context: Record<string, unknown> = {
    window: { devicePixelRatio: DPR },
    [names.padding]: () => 20,
    [names.coords]: (element: Shape) => [0, 0, element.width, element.height],
    [names.isLinear]: (element: Shape) =>
      element.type === 'line' || element.type === 'arrow',
    [names.isFreeDraw]: (element: Shape) => element.type === 'freedraw',
    [names.distance]: (a: number, b: number) => Math.abs(a - b),
    [names.isArrow]: (element: Shape) => element.type === 'arrow',
    [names.isImage]: (element: Shape) => element.type === 'image',
    [names.boundText]: (element: Shape) => (element.label ? {} : null),
    [names.frame]: () => null,
    [names.store]: new WeakMap(),
    [names.defaults]: { zoom: { value: 1 } },
    // Records each rebuild and returns what generateElementCanvas stores.
    [names.generate]: (
      element: Shape,
      map: unknown,
      zoom: { value: number },
      _: unknown,
      appState: { theme: string }
    ) => {
      builds++;
      return {
        element,
        scale: size(element, map, zoom).scale,
        zoomValue: zoom.value,
        theme: appState.theme,
        boundTextElementVersion: null,
        containingFrameOpacity: 100,
        imageCrop: null,
        angle: element.angle,
      };
    },
  };
  const size = runInNewContext(`(${slice(file, ...sizing)})`, context) as (
    element: Shape,
    map: unknown,
    zoom: { value: number }
  ) => Size;
  context[names.sizing] = size;
  const cached = runInNewContext(`(${slice(file, ...cache)})`, context) as (
    element: Shape,
    map: unknown,
    renderConfig: unknown,
    appState: unknown
  ) => unknown;
  return {
    size: (element: Shape, zoom: number) =>
      size(element, new Map(), { value: zoom }),
    /** Draws `element` at `zoom` through the cache; returns the rebuilds. */
    draw(element: Shape, zoom: number) {
      cached(element, new Map(), {}, { zoom: { value: zoom }, theme: 'l' });
      return builds;
    },
  };
}

type Draw = (
  context: unknown,
  image: { width: number; height: number },
  dx: number,
  dy: number,
  dw: number,
  dh: number
) => void;

/** The clipped draw the patch appends to `file`. */
function clippedDraw(file: string): Draw {
  const source = slice(
    file,
    '/* tuturuuu-draw-clipped:start */',
    '/* tuturuuu-draw-clipped:end */'
  );
  return runInNewContext(`${source};__ttrDrawClipped`, {}) as Draw;
}

/** A 1920 by 1080 canvas under `transform`, recording drawImage calls. */
function screen(transform: Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f', number>) {
  const calls: number[][] = [];
  return {
    calls,
    context: {
      canvas: { width: 1920, height: 1080 },
      getTransform: () => transform,
      drawImage: (_: unknown, ...args: number[]) => calls.push(args),
    },
  };
}

describe.each(BUILDS)('patched Excalidraw $build canvas cache', (build) => {
  const { size, draw } = load(build);
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

  it('keeps the upstream zoom scale for images', () => {
    const image = { type: 'image', width: 100, height: 100 };
    expect(size(image, 3).scale).toBe(3);
  });

  it('rebuilds a cached canvas only when its scale changes', () => {
    const box = { type: 'rectangle', width: 300, height: 200, angle: 0 };
    expect(draw(box, 2)).toBe(1);
    // Zoom 2 and 3 both cache at 100%: nothing to rebuild.
    expect(draw(box, 3)).toBe(1);
    expect(draw(box, 1)).toBe(1);
    expect(draw(box, 0.5)).toBe(2);
    expect(draw(box, 0.5)).toBe(2);
  });

  describe('clipped draw at 10x zoom', () => {
    const drawClipped = () => clippedDraw(build.file);
    const image = { width: 4096, height: 4096 };
    const zoomed = { a: 10, b: 0, c: 0, d: 10, e: -20_000, f: -10_000 };

    it('copies at most a viewport of pixels from the matching source', () => {
      const { calls, context } = screen(zoomed);
      drawClipped()(context, image, 0, 0, 4096, 4096);
      const [sx, sy, sw, sh, x, y, w, h] = calls[0]!;
      expect([x, y, w, h]).toEqual([2000, 1000, 192, 108]);
      expect(w! * 10 * h! * 10).toBeLessThanOrEqual(1920 * 1080);
      // The destination is the same size as the source here.
      expect([sx, sy, sw, sh]).toEqual([2000, 1000, 192, 108]);
    });

    it('draws a visible element whole and skips one off screen', () => {
      const { calls, context } = screen(zoomed);
      drawClipped()(context, image, 2010, 1010, 10, 10);
      expect(calls).toEqual([[2010, 1010, 10, 10]]);
      drawClipped()(context, image, 0, 0, 100, 100);
      expect(calls).toHaveLength(1);
    });

    it('bounds a rotated draw by the rotated viewport', () => {
      const r = Math.SQRT1_2 * 10;
      const turned = { a: r, b: r, c: -r, d: r, e: 0, f: 0 };
      const { calls, context } = screen(turned);
      drawClipped()(context, image, -5000, -5000, 10_000, 10_000);
      const [, , , , , , w, h] = calls[0]!;
      // The viewport turned 45 degrees spans (1920 + 1080) / sqrt(2) a side.
      expect(w! * h! * 100).toBeLessThanOrEqual((1920 + 1080) ** 2 / 2 + 1);
    });
  });
});
