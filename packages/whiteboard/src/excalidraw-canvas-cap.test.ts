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
 * - a frame draws at most the 24 topmost viewport-covering elements.
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

/** The frame's skip rule the patch appends to `file`. */
function coveringToSkip(file: string): Skip {
  const source = slice(
    file,
    '/* tuturuuu-lod:start */',
    '/* tuturuuu-lod:end */'
  );
  return runInNewContext(`${source};__ttrCoveringToSkip`, {}) as Skip;
}

/** A 1920 by 1080 view at `zoom`, scrolled to the scene origin. */
const view = (zoom: number) => ({
  zoom: { value: zoom },
  width: 1920,
  height: 1080,
  scrollX: 0,
  scrollY: 0,
});

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

  describe('viewport-covering elements per frame', () => {
    const skip = (
      elements: readonly Box[],
      zoom = 10,
      exporting = false
    ) =>
      coveringToSkip(build.file)(
        elements,
        (element) => element,
        view(zoom),
        exporting
      );
    // At 10x a 1920 by 1080 view shows 192 by 108 scene units.
    const stack = (count: number): Box[] =>
      Array.from({ length: count }, (_, i) => [-i, -i, 1000, 1000]);

    it('draws only the 24 topmost of 1,000 stacked covering elements', () => {
      const elements = stack(1000);
      const skipped = skip(elements);
      const drawn = elements.filter((element) => !skipped.has(element));
      expect(drawn).toHaveLength(24);
      expect(drawn).toEqual(elements.slice(-24));
    });

    it('always draws small elements, wherever they sit in the stack', () => {
      const elements = stack(100).flatMap((element, i): Box[] => [
        element,
        [i, i, i + 10, i + 10],
      ]);
      const skipped = skip(elements);
      expect(skipped.size).toBe(100 - 24);
      for (const [x1, , x2] of skipped) expect(x2 - x1).toBeGreaterThan(500);
    });

    it('counts only what covers half the view, at the current zoom', () => {
      // A third of the view, inside it: never covering.
      const third = stack(1000).map((): Box => [0, 0, 64, 108]);
      expect(skip(third).size).toBe(0);
      // Zoomed out, the same stack fits in the view and nothing is skipped.
      expect(skip(stack(1000), 0.5).size).toBe(0);
      // Exactly 24 covering elements all draw; an export draws everything.
      expect(skip(stack(24)).size).toBe(0);
      expect(skip(stack(1000), 10, true).size).toBe(0);
    });

    it('is wired into the static scene before each element draws', () => {
      const text = readFileSync(join(packageRoot, build.file), 'utf8');
      const calls = text.split('__ttrCoveringToSkip(').length - 1;
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
