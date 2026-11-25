/**
 * Fill styles roughjs draws as parallel lines `strokeWidth * 4` apart, and how
 * many lines each draws per hachure line: cross-hatch adds a second set and
 * zigzag joins each pair with a return stroke.
 */
const LINE_FILL_FACTOR: Readonly<Record<string, number>> = {
  hachure: 1,
  'cross-hatch': 2,
  zigzag: 2,
};

type FillShape = {
  isDeleted?: boolean;
  fillStyle?: unknown;
  backgroundColor?: unknown;
  width?: unknown;
  height?: unknown;
  strokeWidth?: unknown;
  points?: unknown;
};

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** The width and height the element's points span, or zeros without points. */
function pointSpan(points: unknown) {
  if (!Array.isArray(points) || points.length === 0) return [0, 0] as const;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!Array.isArray(point)) continue;
    const x = finiteOr(point[0], 0);
    const y = finiteOr(point[1], 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < minX) return [0, 0] as const;
  return [maxX - minX, maxY - minY] as const;
}

/**
 * Roughly how many lines an element's fill makes every viewer draw: the
 * diagonal of its box over the gap Excalidraw derives from the stroke width,
 * times the style's lines per hachure line. A linear or freehand shape fills
 * from its points, so the box is the larger of its size and its points' span.
 * Excalidraw draws no fill on a `transparent` background; a missing fill style
 * reaches roughjs as hachure, so it counts as hachure.
 */
export function estimatedFillLines(element: FillShape) {
  if (element.isDeleted || element.backgroundColor === 'transparent') return 0;
  const style =
    typeof element.fillStyle === 'string' ? element.fillStyle : 'hachure';
  const factor = LINE_FILL_FACTOR[style] ?? 0;
  if (factor === 0) return 0;
  const [spanX, spanY] = pointSpan(element.points);
  const width = Math.max(Math.abs(finiteOr(element.width, 0)), spanX);
  const height = Math.max(Math.abs(finiteOr(element.height, 0)), spanY);
  const gap = Math.max(0.1, finiteOr(element.strokeWidth, 1) * 4);
  return (Math.hypot(width, height) / gap) * factor;
}
