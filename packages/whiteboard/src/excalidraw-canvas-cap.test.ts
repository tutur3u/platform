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
 * - a frame draws cached canvases worth at most 64 viewports of visible
 *   area, topmost first, charging each element its padded canvas as drawn,
 *   rotated.
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
type Point = [number, number];
/** What the frame budget reads of an element, set directly by each test. */
type Item = {
  /** Unrotated absolute coordinates, as getElementAbsoluteCoords gives. */
  coords: Box;
  /** Rotated bounds, as getElementBounds gives; the coords when not set. */
  bounds?: Box;
  angle?: number;
  /** Canvas padding in device pixels; 20 when not given. */
  padding?: number;
  text?: Item;
  arrow?: true;
};
type Measure = ReturnType<typeof measure>;
type Skip = (
  elements: readonly Item[],
  measure: Measure,
  appState: unknown,
  isExporting: boolean
) => Set<Item>;

// Earlier patches read `bounds`; this one reads `coords` and `angle`.
const measure = (dpr: number) => ({
  bounds: (item: Item) => item.bounds ?? item.coords,
  coords: (item: Item) => item.coords,
  angle: (item: Item) => item.angle ?? 0,
  padding: (item: Item) => item.padding ?? 20,
  boundText: (item: Item) => item.text ?? null,
  isArrow: (item: Item) => item.arrow === true,
  dpr,
});

const boxOf = (points: readonly Point[]): Box => [
  Math.min(...points.map(([x]) => x)),
  Math.min(...points.map(([, y]) => y)),
  Math.max(...points.map(([x]) => x)),
  Math.max(...points.map(([, y]) => y)),
];

/**
 * An element drawn through `points` at `angle`. Its coords are the points'
 * box; its bounds are the points rotated about that box's centre, as
 * Excalidraw computes them for lines, strokes and diamonds.
 */
function rotated(
  points: readonly Point[],
  angle: number,
  padding?: number
): Item {
  const coords = boxOf(points);
  const cx = (coords[0] + coords[2]) / 2;
  const cy = (coords[1] + coords[3]) / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const turned = points.map(
    ([x, y]): Point => [
      cx + (x - cx) * cos - (y - cy) * sin,
      cy + (x - cx) * sin + (y - cy) * cos,
    ]
  );
  return { coords, bounds: boxOf(turned), angle, padding };
}

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

/**
 * Viewports `items` draw in `at`: each cached canvas (coords grown by the
 * padding, rotated about its centre) by its bounding box, clipped to the
 * view.
 */
function viewports(items: readonly Item[], at: View, dpr: number) {
  const left = -at.scrollX;
  const top = -at.scrollY;
  const right = left + at.width / at.zoom.value;
  const bottom = top + at.height / at.zoom.value;
  const area = (right - left) * (bottom - top);
  return items.reduce((sum, item) => {
    const pad = (item.padding ?? 20) / dpr;
    const [x1, y1, x2, y2] = item.coords;
    const cos = Math.abs(Math.cos(item.angle ?? 0));
    const sin = Math.abs(Math.sin(item.angle ?? 0));
    const halfW = (x2 - x1) / 2 + pad;
    const halfH = (y2 - y1) / 2 + pad;
    const spanX = halfW * cos + halfH * sin;
    const spanY = halfW * sin + halfH * cos;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const w = Math.min(cx + spanX, right) - Math.max(cx - spanX, left);
    const h = Math.min(cy + spanY, bottom) - Math.max(cy - spanY, top);
    return w > 0 && h > 0 ? sum + (w * h) / area : sum;
  }, 0);
}

const BUDGET = 64;

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
    const skip = (
      items: readonly Item[],
      at: View,
      dpr = 2,
      exporting = false
    ) => overAreaBudget(build.file)(items, measure(dpr), at, exporting);
    const drawn = (items: readonly Item[], at: View, dpr = 2) => {
      const skipped = skip(items, at, dpr);
      return items.filter((item) => !skipped.has(item));
    };
    const stack = (count: number, item: Item): Item[] =>
      Array.from({ length: count }, () => ({ ...item }));
    /** `shown` is the topmost run of `items` and draws within the budget. */
    const bounded = (
      items: Item[],
      shown: Item[],
      at: View,
      dpr: number
    ) => {
      expect(shown).toEqual(items.slice(-shown.length));
      expect(shown.length).toBeLessThan(items.length);
      expect(viewports(shown, at, dpr)).toBeLessThanOrEqual(BUDGET);
    };

    it('charges zero-size shapes their padded canvas', () => {
      // At 30x and DPR 3 each draws a 40 px canvas: 13.3 units a side.
      const at = view(30);
      const items = stack(40_000, { coords: [5, 5, 5, 5] });
      const shown = drawn(items, at, 3);
      bounded(items, shown, at, 3);
      expect(viewports(shown, at, 3)).toBeGreaterThan(BUDGET - 1);
    });

    it('charges a one-point freehand stroke its 12-stroke padding', () => {
      // Width 16 pads 192 device pixels: a 128-unit square at DPR 3.
      const at = view(30);
      const items = stack(455, { coords: [10, 10, 10, 10], padding: 192 });
      expect(drawn(items, at, 3)).toEqual(items.slice(-BUDGET));
    });

    it('charges a strip whose unrotated box is off the view', () => {
      // Centred below the view, turned 45 degrees across it.
      const at = view(30);
      const strip = (): Item =>
        rotated(
          [
            [-568, 300],
            [632, 300],
          ],
          Math.PI / 4
        );
      const items = Array.from({ length: 1400 }, strip);
      expect(drawn(items, at)).toEqual(items.slice(-BUDGET));
    });

    // Real rotated geometry: Excalidraw's bounds follow the rotated points,
    // but it draws the whole padded canvas, rotated.
    const diagonal = (length: number, padding: number) => (): Item =>
      rotated(
        [
          [0, 0],
          [length, length],
        ],
        Math.PI / 4,
        padding
      );

    it.each([
      ['freehand stroke of width 0.5', 6],
      ['line', 20],
    ])('charges a 45-degree diagonal %s its rotated canvas', (_, padding) => {
      // 434 strokes of length 127 at 10x and DPR 3.
      const at = view(10);
      const items = Array.from({ length: 434 }, diagonal(127, padding));
      const shown = drawn(items, at, 3);
      bounded(items, shown, at, 3);
      expect(viewports(shown, at, 3)).toBeGreaterThan(BUDGET - 1);
    });

    it('charges a 45-degree diamond its rotated canvas', () => {
      const at = view(5);
      const diamond = (): Item =>
        rotated(
          [
            [50, 0],
            [100, 50],
            [50, 100],
            [0, 50],
          ],
          Math.PI / 4
        );
      // The canvas is the 100-unit box, wider than the rotated corners.
      const items = Array.from({ length: 400 }, diamond);
      const shown = drawn(items, at);
      bounded(items, shown, at, 2);
      expect(viewports(shown, at, 2)).toBeGreaterThan(BUDGET - 1);
    });

    it('adds bound text to its container, even an empty one', () => {
      const at = view(30);
      const items = stack(500, {
        coords: [0, 0, 0, 0],
        text: { coords: [0, 0, 64, 36], padding: 10 },
      });
      const shown = drawn(items, at);
      expect(shown).toEqual(items.slice(-shown.length));
      expect(shown.length).toBeLessThanOrEqual(BUDGET);
    });

    it('charges a labelled arrow its label square, not its line', () => {
      // A flat arrow's label canvas is a square of its length.
      const at = view(1);
      const arrow: Item = {
        coords: [0, 0, 16_000, 0],
        arrow: true,
        text: { coords: [7990, -10, 8010, 10] },
      };
      const items = stack(100, arrow);
      expect(drawn(items, at).length).toBeLessThanOrEqual(BUDGET);
      // Unlabelled, the same arrows draw a thin strip and all fit.
      const plain = stack(100, { coords: [0, 0, 16_000, 0] });
      expect(drawn(plain, at)).toHaveLength(100);
    });

    it('bounds 20,000 tiny shapes at 30x and draws them all at 1x', () => {
      const tiny = stack(20_000, { coords: [10, 10, 11, 11] });
      const at = view(30);
      bounded(tiny, drawn(tiny, at), at, 2);
      // Spread over the view at 1x they cost little: all draw.
      const spread = Array.from({ length: 20_000 }, (_, i): Item => {
        const x = (i % 200) * 9;
        const y = Math.floor(i / 200) * 10;
        return { coords: [x, y, x + 1, y + 1] };
      });
      expect(drawn(spread, view(1))).toHaveLength(20_000);
    });

    it('charges every element at least 1/2000 of a viewport', () => {
      const away = stack(130_000, { coords: [9e6, 9e6, 9e6 + 1, 9e6 + 1] });
      const shown = drawn(away, view(1)).length;
      expect(shown).toBeLessThanOrEqual(128_000);
      expect(shown).toBeGreaterThan(127_990);
    });

    it('draws the 64 topmost of 1,000 view-covering boxes at 3x', () => {
      const items = Array.from(
        { length: 1000 },
        (_, i): Item => ({ coords: [-i, -i, 1000, 1000] })
      );
      expect(drawn(items, view(3))).toEqual(items.slice(-BUDGET));
    });

    it('bounds 6,700 stacked just-under-half boxes at 30x', () => {
      const at = view(30);
      const items = stack(6700, { coords: [0, 0, 44.8, 25.2] });
      bounded(items, drawn(items, at), at, 2);
    });

    // The review's boards in a 1024 by 768 view at 2x: diagonal lines (20 px
    // padding) and zig-zag freehand strokes of width 2 (24 px padding).
    const board = view(2, 1024, 768, -60);
    const lines = (count: number) =>
      Array.from(
        { length: count },
        (_, i): Item => ({ coords: [i * 8, 0, i * 8 + 400, 400] })
      );
    const strokes = (count: number) =>
      Array.from(
        { length: count },
        (_, i): Item => ({ coords: [0, i * 2, 400, 400 + i * 2], padding: 24 })
      );

    it('draws 80-line and 80-stroke boards completely at 2x', () => {
      for (const items of [lines(80), strokes(80)]) {
        expect(viewports(items, board, 2)).toBeLessThan(BUDGET);
        expect(drawn(items, board)).toEqual(items);
      }
    });

    // This cliff is the model's bound. In the reviewer's run, real
    // Excalidraw at 2x drew 112, 113 and 120 stacked strokes at 52 to 56
    // viewports, since the real canvases differ from these boxes.
    it('skips the oldest strokes past the modelled cliff at 2x', () => {
      const items = strokes(120);
      const shown = drawn(items, board);
      expect(shown).toEqual(items.slice(-shown.length));
      expect(shown.length).toBeGreaterThan(105);
      expect(shown.length).toBeLessThan(120);
    });

    it('charges small elements a little; they draw until it is spent', () => {
      const at = view(1);
      const small = stack(1000, { coords: [0, 0, 10, 10] });
      const cover = (count: number) =>
        stack(count, { coords: [0, 0, 1920, 1080] });
      expect(drawn([...small, ...cover(63)], at)).toHaveLength(1063);
      // The 65th covering box passes the budget; everything older is skipped.
      expect(drawn([...small, ...cover(65)], at)).toHaveLength(BUDGET);
    });

    it('counts an unmeasurable element as the whole budget', () => {
      const at = view(1);
      const below = stack(10, { coords: [0, 0, 10, 10] });
      const broken: Item = { coords: [0, 0, Number.NaN, 10] };
      expect(drawn([...below, broken], at)).toEqual([]);
    });

    it('skips nothing in an export', () => {
      const covering = stack(1000, { coords: [0, 0, 1000, 1000] });
      expect(skip(covering, view(10), 2, true).size).toBe(0);
    });

    it('is wired into the static scene before each element draws', () => {
      const text = readFileSync(join(packageRoot, build.file), 'utf8');
      const calls = text.split('__ttrOverAreaBudget(').length - 1;
      // The declaration and one call per build.
      expect(calls).toBe(2);
      expect(text).toContain(
        build.build === 'dev'
          ? 'angle: (el) => el.angle,'
          : '{angle:E=>E.angle,coords:E=>C(E,n),padding:ri,'
      );
      expect(text).toContain(
        build.build === 'dev'
          ? 'if (__ttrSkipped.has(element)) {'
          : 'n.has(E.containerId)||__ttrSkip.has(E))return;'
      );
    });
  });
});
