/**
 * What drawing one board element costs every viewer, in roughly one unit per
 * line or point roughjs and Excalidraw draw. The per-element cap, the scene
 * cap and the guest churn bucket all charge this one estimate. It is an upper
 * bound for the shapes that can cost much: fills, strokes along points,
 * dashes and text. `elementCanvasArea` measures the memory each viewer holds
 * for the element instead.
 */

/** Lines per hachure line: cross-hatch adds a second set, zigzag a return. */
const FILL_FACTOR: Readonly<Record<string, number>> = {
  hachure: 1,
  'cross-hatch': 2,
  zigzag: 2,
};
/** Convex shapes filled from their box. */
const BOX_FILLS = new Set(['rectangle', 'diamond', 'ellipse']);
/** Shapes filled from their points when their background is set. */
const POINT_FILLS = new Set(['line', 'freedraw']);
/** Shapes drawn along their points. */
const POINT_PATHS = new Set(['line', 'arrow', 'freedraw']);
/** Shortest repeat of Excalidraw's dash patterns, in canvas units. */
const DASH_REPEAT: Readonly<Record<string, number>> = {
  dashed: 16,
  dotted: 7.5,
};
/** roughjs curves add points between the given ones. */
const CURVE_FACTOR = 1.25;
/** A dash pattern follows the curve, which runs longer than its points. */
const DASH_CURVE_FACTOR = 1.7;
/**
 * hachure-fill scans one unit at a time across the shape; that many scan steps
 * cost about as much as one drawn line.
 */
const SCAN_STEPS_PER_UNIT = 16;
/** Every estimate is a finite integer no larger than this. */
export const MAX_RENDER_COST = 1e9;
/**
 * Excalidraw caches each element on a canvas of at most this many pixels
 * (`cappedElementCanvasSize`), four bytes each: 64 MiB at the cap.
 */
export const MAX_ELEMENT_CANVAS_PIXELS = 16_777_216;

type CostShape = {
  type?: unknown;
  isDeleted?: unknown;
  fillStyle?: unknown;
  backgroundColor?: unknown;
  strokeStyle?: unknown;
  width?: unknown;
  height?: unknown;
  strokeWidth?: unknown;
  roughness?: unknown;
  points?: unknown;
  text?: unknown;
};

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** A finite, non-negative integer cost; anything else counts as the maximum. */
export function clampRenderCost(value: number) {
  if (!(value >= 0)) return value < 0 ? 0 : MAX_RENDER_COST;
  return Math.min(MAX_RENDER_COST, Math.ceil(value));
}

/** The element's points as finite pairs; malformed entries are skipped. */
function pointsOf(points: unknown): [number, number][] {
  if (!Array.isArray(points)) return [];
  return points.flatMap((point) =>
    Array.isArray(point)
      ? [[finiteOr(point[0], 0), finiteOr(point[1], 0)] as [number, number]]
      : []
  );
}

/** Edge lengths along the points, closing the loop when `closed`. */
function edgeLengths(points: [number, number][], closed: boolean) {
  const lengths: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    lengths.push(Math.hypot(x1 - x0, y1 - y0));
  }
  if (closed && points.length > 1) {
    const [x0, y0] = points.at(-1)!;
    const [x1, y1] = points[0]!;
    lengths.push(Math.hypot(x1 - x0, y1 - y0));
  }
  return lengths;
}

/**
 * Fill lines plus scan steps. A convex box shape draws at most its diagonal
 * over the gap and scans its diagonal. A point-filled shape may be concave, so
 * each edge counts the scan lines it crosses, `(length / gap + 1) / 2`
 * segments, which bounds the segments hachure-fill emits for any polygon; its
 * scan touches every edge on each step, so it counts the whole outline. A
 * cross-hatch fill scans twice. A solid fill on points traces each point. A
 * transparent background draws no fill; a missing fill style reaches roughjs
 * as hachure.
 */
function fillCost(element: CostShape, type: string) {
  if (element.backgroundColor === 'transparent') return 0;
  const style =
    typeof element.fillStyle === 'string' ? element.fillStyle : 'hachure';
  if (style === 'solid')
    return POINT_FILLS.has(type)
      ? pointsOf(element.points).length * CURVE_FACTOR
      : 0;
  const factor = FILL_FACTOR[style] ?? 0;
  if (factor === 0) return 0;
  const scans = style === 'cross-hatch' ? 2 : 1;
  const gap = Math.max(0.1, finiteOr(element.strokeWidth, 1) * 4);
  if (BOX_FILLS.has(type)) {
    const diagonal = Math.hypot(
      finiteOr(element.width, 0),
      finiteOr(element.height, 0)
    );
    return (
      (diagonal / gap + 1) * factor + (diagonal / SCAN_STEPS_PER_UNIT) * scans
    );
  }
  if (!POINT_FILLS.has(type)) return 0;
  const edges = edgeLengths(pointsOf(element.points), true);
  const crossings = edges.reduce(
    (sum, length) => sum + (length / gap + 1) / 2,
    0
  );
  const outline = edges.reduce((sum, length) => sum + length, 0);
  return (
    crossings * factor * CURVE_FACTOR +
    (outline / SCAN_STEPS_PER_UNIT) * scans
  );
}

/**
 * A line, arrow or freehand stroke draws one segment per point. roughjs
 * strokes a solid line or arrow with roughness twice; a freehand stroke is
 * one outline path, so it never doubles.
 */
function strokeCost(element: CostShape, type: string) {
  if (!POINT_PATHS.has(type)) return 0;
  const twice =
    type !== 'freedraw' &&
    finiteOr(element.roughness, 0) > 0 &&
    element.strokeStyle === 'solid';
  return pointsOf(element.points).length * (twice ? 2 : 1);
}

/** Dashes or dots along the outline: its length over the pattern repeat. */
function dashCost(element: CostShape, type: string) {
  const repeat =
    typeof element.strokeStyle === 'string'
      ? DASH_REPEAT[element.strokeStyle]
      : undefined;
  if (!repeat || type === 'text') return 0;
  const length = POINT_PATHS.has(type)
    ? edgeLengths(pointsOf(element.points), false).reduce(
        (sum, edge) => sum + edge,
        0
      ) * DASH_CURVE_FACTOR
    : 2 *
      (Math.abs(finiteOr(element.width, 0)) +
        Math.abs(finiteOr(element.height, 0)));
  return length / repeat;
}

/** Text draws one line per line of text. */
const textLines = (element: CostShape) =>
  typeof element.text === 'string' ? element.text.split('\n').length : 0;

/**
 * The render cost of one element: one for the element, plus its fill lines
 * and scan steps, the points along its stroke, dashes and text lines. Deleted
 * elements cost nothing.
 */
export function elementRenderCost(element: CostShape) {
  if (element.isDeleted === true) return 0;
  const type = typeof element.type === 'string' ? element.type : '';
  return clampRenderCost(
    1 +
      fillCost(element, type) +
      strokeCost(element, type) +
      dashCost(element, type) +
      textLines(element)
  );
}

/** Width and height a cached element canvas covers, in canvas units. */
function canvasBox(element: CostShape, type: string): [number, number] {
  if (!POINT_PATHS.has(type))
    return [
      Math.abs(finiteOr(element.width, Number.POSITIVE_INFINITY)),
      Math.abs(finiteOr(element.height, Number.POSITIVE_INFINITY)),
    ];
  const points = pointsOf(element.points);
  if (points.length === 0) return [0, 0];
  // A loop, not spread arguments: a member's stroke has no point limit.
  let [minX, minY] = points[0]!;
  let [maxX, maxY] = points[0]!;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return [maxX - minX, maxY - minY];
}

/**
 * Pixels of the canvas every viewer allocates to cache one element: its box
 * (its point bounds for lines, arrows and freehand strokes), at least one
 * pixel each way, up to Excalidraw's cap. Deleted elements hold none; a
 * missing or non-finite size counts as the cap.
 */
export function elementCanvasArea(element: CostShape) {
  if (element.isDeleted === true) return 0;
  const type = typeof element.type === 'string' ? element.type : '';
  const [width, height] = canvasBox(element, type);
  const pixels = Math.max(1, width) * Math.max(1, height);
  if (!(pixels >= 0)) return MAX_ELEMENT_CANVAS_PIXELS;
  return Math.min(MAX_ELEMENT_CANVAS_PIXELS, Math.ceil(pixels));
}
