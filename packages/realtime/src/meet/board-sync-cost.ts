/**
 * What drawing one board element costs every viewer, in roughly one unit per
 * line roughjs and Excalidraw draw. The per-element cap, the scene cap and
 * the guest churn bucket all charge this one estimate. It is an upper bound
 * for the shapes that can cost much: fills, dashes and text.
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
/**
 * hachure-fill scans one unit at a time across the shape; that many scan steps
 * cost about as much as one drawn line.
 */
const SCAN_STEPS_PER_UNIT = 16;
/** Every estimate is a finite integer no larger than this. */
export const MAX_RENDER_COST = 1e9;

type CostShape = {
  type?: unknown;
  isDeleted?: unknown;
  fillStyle?: unknown;
  backgroundColor?: unknown;
  strokeStyle?: unknown;
  width?: unknown;
  height?: unknown;
  strokeWidth?: unknown;
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

function spanDiagonal(points: [number, number][]) {
  if (points.length === 0) return 0;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys)
  );
}

/**
 * Fill lines plus scan steps. A convex box shape draws at most its diagonal
 * over the gap. A point-filled shape may be concave, so each edge counts the
 * scan lines it crosses, `(length / gap + 1) / 2` segments, which bounds the
 * segments hachure-fill emits for any polygon. A transparent background draws
 * no fill; a missing fill style reaches roughjs as hachure.
 */
function fillCost(element: CostShape, type: string) {
  if (element.backgroundColor === 'transparent') return 0;
  const style =
    typeof element.fillStyle === 'string' ? element.fillStyle : 'hachure';
  const factor = FILL_FACTOR[style] ?? 0;
  if (factor === 0) return 0;
  const gap = Math.max(0.1, finiteOr(element.strokeWidth, 1) * 4);
  if (BOX_FILLS.has(type)) {
    const diagonal = Math.hypot(
      finiteOr(element.width, 0),
      finiteOr(element.height, 0)
    );
    return (diagonal / gap + 1) * factor + diagonal / SCAN_STEPS_PER_UNIT;
  }
  if (!POINT_FILLS.has(type)) return 0;
  const points = pointsOf(element.points);
  const crossings = edgeLengths(points, true).reduce(
    (sum, length) => sum + (length / gap + 1) / 2,
    0
  );
  return (
    crossings * factor * CURVE_FACTOR +
    spanDiagonal(points) / SCAN_STEPS_PER_UNIT
  );
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
      ) * CURVE_FACTOR
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
 * and scan steps, dashes and text lines. Deleted elements cost nothing.
 */
export function elementRenderCost(element: CostShape) {
  if (element.isDeleted === true) return 0;
  const type = typeof element.type === 'string' ? element.type : '';
  return clampRenderCost(
    1 +
      fillCost(element, type) +
      dashCost(element, type) +
      textLines(element)
  );
}
