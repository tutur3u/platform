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
 * - a cached canvas is rebuilt only when its effective scale changes, and the
 *   scale is recomputed only when the zoom changes;
 * - a frame draws cached canvases worth at most 32 viewports of visible
 *   area, topmost first.
 * These tests run that code from each build the app loads, at a device pixel
 * ratio of two (the server's guest budget measures at three). After an
 * upgrade the chunk names change and these tests fail: re-apply the patch and
 * update the chunk and helper names here.
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
  let sizings = 0;
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
  // The patch's appended helpers, which the cache check calls.
  const text = readFileSync(join(packageRoot, file), 'utf8');
  if (text.includes('/* tuturuuu-lod:start */'))
    runInNewContext(
      slice(file, '/* tuturuuu-lod:start */', '/* tuturuuu-lod:end */'),
      context
    );
  // The cache check's own calls are counted; the stub above is not.
  context[names.sizing] = (...args: Parameters<typeof size>) => {
    sizings++;
    return size(...args);
  };
  const cached = runInNewContext(`(${slice(file, ...cache)})`, context) as (
    element: Shape,
    map: unknown,
    renderConfig: unknown,
    appState: unknown
  ) => unknown;
  return {
    size: (element: Shape, zoom: number) =>
      size(element, new Map(), { value: zoom }),
    /** Draws `element` at `zoom` through the cache. */
    draw(element: Shape, zoom: number) {
      cached(element, new Map(), {}, { zoom: { value: zoom }, theme: 'l' });
      return { builds, sizings };
    },
  };
}

type Box = [number, number, number, number];
type Skip = (
  elements: readonly Box[],
  coordsOf: (element: Box) => Box,
  appState: unknown,
  isExporting: boolean
) => Set<Box>;

/** The frame's area budget the patch appends to `file`. */
function overAreaBudget(file: string): Skip {
  const source = slice(
    file,
    '/* tuturuuu-lod:start */',
    '/* tuturuuu-lod:end */'
  );
  return runInNewContext(`${source};__ttrOverAreaBudget`, {}) as Skip;
}

type View = ReturnType<typeof view>;

/** A view at `zoom`, 1920 by 1080 and scrolled to the origin by default. */
const view = (zoom: number, width = 1920, height = 1080, scroll = 0) => ({
  zoom: { value: zoom },
  width,
  height,
  scrollX: scroll,
  scrollY: scroll,
});

/** Viewports of visible area `boxes` cover in `at`. */
function viewports(boxes: readonly Box[], at: View) {
  const left = -at.scrollX;
  const top = -at.scrollY;
  const right = left + at.width / at.zoom.value;
  const bottom = top + at.height / at.zoom.value;
  const area = (right - left) * (bottom - top);
  return boxes.reduce((sum, [x1, y1, x2, y2]) => {
    const w = Math.min(x2, right) - Math.max(x1, left);
    const h = Math.min(y2, bottom) - Math.max(y1, top);
    return w > 0 && h > 0 ? sum + (w * h) / area : sum;
  }, 0);
}

const BUDGET = 32;

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
    expect(draw(box, 2)).toEqual({ builds: 1, sizings: 0 });
    // The same zoom again: no scale check at all.
    expect(draw(box, 2)).toEqual({ builds: 1, sizings: 0 });
    // Zoom 2 and 3 both cache at 100%: one check, nothing to rebuild, and
    // the new zoom is recorded so the next frame skips the check.
    expect(draw(box, 3)).toEqual({ builds: 1, sizings: 1 });
    expect(draw(box, 3)).toEqual({ builds: 1, sizings: 1 });
    expect(draw(box, 1)).toEqual({ builds: 1, sizings: 2 });
    expect(draw(box, 0.5)).toEqual({ builds: 2, sizings: 3 });
    expect(draw(box, 0.5)).toEqual({ builds: 2, sizings: 3 });
  });

  describe('visible-area budget per frame', () => {
    const skip = (elements: readonly Box[], at: View, exporting = false) =>
      overAreaBudget(build.file)(elements, (element) => element, at, exporting);
    const drawn = (elements: readonly Box[], at: View) => {
      const skipped = skip(elements, at);
      return elements.filter((element) => !skipped.has(element));
    };
    const stack = (count: number, box: Box): Box[] =>
      Array.from({ length: count }, () => [...box] as Box);

    it('bounds 6,700 stacked just-under-half boxes at 30x', () => {
      // At 30x a 1920 by 1080 view shows 64 by 36 units; each box is 0.49.
      const at = view(30);
      const elements = stack(6700, [0, 0, 44.8, 25.2]);
      const shown = drawn(elements, at);
      expect(shown).toEqual(elements.slice(-shown.length));
      expect(viewports(shown, at)).toBeLessThanOrEqual(BUDGET);
      expect(viewports(shown, at)).toBeGreaterThan(BUDGET - 1);
    });

    it('draws the 32 topmost of 1,000 view-covering boxes at 3x', () => {
      const elements = Array.from(
        { length: 1000 },
        (_, i): Box => [-i, -i, 1000, 1000]
      );
      expect(drawn(elements, view(3))).toEqual(elements.slice(-32));
    });

    it('draws every element of ordinary boards at 2x', () => {
      // 40 diagonal lines and 40 zig-zag strokes, in a 1024 by 768 view.
      const at = view(2, 1024, 768, -60);
      const lines = Array.from(
        { length: 40 },
        (_, i): Box => [i * 8, 0, i * 8 + 400, 400]
      );
      const strokes = Array.from(
        { length: 40 },
        (_, i): Box => [0, i * 2, 400, 400 + i * 2]
      );
      for (const board of [lines, strokes]) {
        expect(viewports(board, at)).toBeLessThan(BUDGET);
        expect(drawn(board, at)).toEqual(board);
      }
    });

    it('charges small elements a little; they draw until it is spent', () => {
      const at = view(1);
      const small = stack(1000, [0, 0, 10, 10]);
      const cover = (count: number) => stack(count, [0, 0, 1920, 1080]);
      expect(drawn([...small, ...cover(31)], at)).toHaveLength(1031);
      // The 33rd covering box passes the budget; everything older is skipped.
      expect(drawn([...small, ...cover(33)], at)).toHaveLength(32);
    });

    it('charges nothing off screen and skips nothing in an export', () => {
      const at = view(10);
      const away = stack(1000, [5000, 5000, 6000, 6000]);
      expect(drawn(away, at)).toHaveLength(1000);
      const covering = stack(1000, [0, 0, 1000, 1000]);
      expect(skip(covering, at, true).size).toBe(0);
    });

    it('is wired into the static scene before each element draws', () => {
      const text = readFileSync(join(packageRoot, build.file), 'utf8');
      const calls = text.split('__ttrOverAreaBudget(').length - 1;
      // The declaration and one call per build.
      expect(calls).toBe(2);
      expect(text).toContain(
        build.build === 'dev'
          ? 'if (__ttrSkipped.has(element)) {'
          : 'n.has(E.containerId)||__ttrSkip.has(E))return;'
      );
    });
  });
});
