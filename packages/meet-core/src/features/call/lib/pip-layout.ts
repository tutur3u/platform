/**
 * Geometry and preferences for the floating self-preview card. Pure functions
 * so snapping, clamping, keyboard moves and persisted state can be unit
 * tested without a DOM.
 */
export type PipCorner =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';
export type PipSize = 's' | 'm' | 'l';
export type PipPrefs = { corner: PipCorner; size: PipSize; hidden: boolean };
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Insets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export const PIP_CORNERS: readonly PipCorner[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];
export const PIP_SIZES: readonly PipSize[] = ['s', 'm', 'l'];
/** Card width per preset, in CSS pixels, before narrow-container capping. */
export const PIP_WIDTHS: Record<PipSize, number> = { s: 128, m: 176, l: 248 };
export const PIP_MIN_WIDTH = 96;
/** Share of the container's free width the card may use on narrow screens. */
export const PIP_MAX_WIDTH_RATIO = 0.62;
export const PIP_MARGIN = 12;
export const PIP_STORAGE_KEY = 'meet.self-preview';
export const DEFAULT_PIP_PREFS: PipPrefs = {
  corner: 'bottom-right',
  size: 'm',
  hidden: false,
};

const isCorner = (value: unknown): value is PipCorner =>
  PIP_CORNERS.includes(value as PipCorner);
const isSize = (value: unknown): value is PipSize =>
  PIP_SIZES.includes(value as PipSize);

/** Accepts only a well-formed preference object; anything else is the default. */
export function parsePipPrefs(raw: unknown): PipPrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_PIP_PREFS;
  const value = raw as Record<string, unknown>;
  return {
    corner: isCorner(value.corner) ? value.corner : DEFAULT_PIP_PREFS.corner,
    size: isSize(value.size) ? value.size : DEFAULT_PIP_PREFS.size,
    hidden: typeof value.hidden === 'boolean' ? value.hidden : false,
  };
}

type PrefsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Storage access is best effort: private mode or quota errors fall back. */
export function readPipPrefs(
  storage: PrefsStorage | null | undefined
): PipPrefs {
  try {
    const raw = storage?.getItem(PIP_STORAGE_KEY);
    return raw ? parsePipPrefs(JSON.parse(raw)) : DEFAULT_PIP_PREFS;
  } catch {
    return DEFAULT_PIP_PREFS;
  }
}

export function writePipPrefs(
  storage: PrefsStorage | null | undefined,
  prefs: PipPrefs
): boolean {
  try {
    storage?.setItem(PIP_STORAGE_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/** Card size for a preset inside a container, never wider than it can show. */
export function pipDimensions(
  size: PipSize,
  container: Size,
  insets: Insets,
  aspectRatio = 16 / 9
): Size {
  const freeWidth = Math.max(0, container.width - insets.left - insets.right);
  const freeHeight = Math.max(0, container.height - insets.top - insets.bottom);
  const ratio = aspectRatio > 0 ? aspectRatio : 16 / 9;
  let width = Math.min(PIP_WIDTHS[size], freeWidth * PIP_MAX_WIDTH_RATIO);
  width = Math.max(Math.min(PIP_MIN_WIDTH, freeWidth), width);
  let height = width / ratio;
  if (height > freeHeight * PIP_MAX_WIDTH_RATIO && freeHeight > 0) {
    height = freeHeight * PIP_MAX_WIDTH_RATIO;
    width = height * ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

/** Top-left offset of the card when docked at `corner`. */
export function cornerPosition(
  corner: PipCorner,
  container: Size,
  card: Size,
  insets: Insets
): Point {
  const x = corner.endsWith('left')
    ? insets.left
    : container.width - insets.right - card.width;
  const y = corner.startsWith('top')
    ? insets.top
    : container.height - insets.bottom - card.height;
  return { x: Math.max(insets.left, x), y: Math.max(insets.top, y) };
}

/** Keeps a dragged card fully inside the usable area. */
export function clampPosition(
  point: Point,
  container: Size,
  card: Size,
  insets: Insets
): Point {
  const maxX = Math.max(
    insets.left,
    container.width - insets.right - card.width
  );
  const maxY = Math.max(
    insets.top,
    container.height - insets.bottom - card.height
  );
  return {
    x: Math.min(Math.max(point.x, insets.left), maxX),
    y: Math.min(Math.max(point.y, insets.top), maxY),
  };
}

/** The corner whose quadrant holds the card's centre. */
export function nearestCorner(
  position: Point,
  card: Size,
  container: Size
): PipCorner {
  const centerX = position.x + card.width / 2;
  const centerY = position.y + card.height / 2;
  const vertical = centerY < container.height / 2 ? 'top' : 'bottom';
  const horizontal = centerX < container.width / 2 ? 'left' : 'right';
  return `${vertical}-${horizontal}`;
}

/** Projects a release velocity a little ahead so a flick lands where it aims. */
export function projectedPosition(
  position: Point,
  velocity: Point,
  lookaheadMs = 120
): Point {
  return {
    x: position.x + velocity.x * lookaheadMs,
    y: position.y + velocity.y * lookaheadMs,
  };
}

const ARROW_MOVES: Record<string, (corner: PipCorner) => PipCorner> = {
  ArrowUp: (corner) => corner.replace('bottom', 'top') as PipCorner,
  ArrowDown: (corner) => corner.replace('top', 'bottom') as PipCorner,
  ArrowLeft: (corner) => corner.replace('right', 'left') as PipCorner,
  ArrowRight: (corner) => corner.replace('left', 'right') as PipCorner,
};

/** Arrow keys dock the card at the neighbouring corner; other keys are ignored. */
export function moveCorner(corner: PipCorner, key: string): PipCorner {
  return ARROW_MOVES[key]?.(corner) ?? corner;
}

/** Next preset for a tap on the resize control, wrapping from L back to S. */
export function nextSize(size: PipSize): PipSize {
  return PIP_SIZES[(PIP_SIZES.indexOf(size) + 1) % PIP_SIZES.length] ?? size;
}

/** One preset step from a pinch; small pinches change nothing. */
export function pinchSize(size: PipSize, scale: number): PipSize {
  const index = PIP_SIZES.indexOf(size);
  if (scale >= 1.25)
    return PIP_SIZES[Math.min(index + 1, PIP_SIZES.length - 1)] ?? size;
  if (scale <= 0.8) return PIP_SIZES[Math.max(index - 1, 0)] ?? size;
  return size;
}

/** Travel before a press becomes a drag: coarse pointers jitter more than a mouse. */
export const PIP_DRAG_SLOP = { mouse: 3, coarse: 10 } as const;

export function dragSlop(pointerType: string): number {
  return pointerType === 'mouse' ? PIP_DRAG_SLOP.mouse : PIP_DRAG_SLOP.coarse;
}

export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
