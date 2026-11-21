/** Every participant draws in the same board space, whatever their panel size. */
export const WHITEBOARD_WIDTH = 1200;
export const WHITEBOARD_HEIGHT = 900;
/** Stroke width, in board units, at the plain pressure of a mouse or finger. */
export const WHITEBOARD_STROKE_WIDTH = 6;
export const WHITEBOARD_MAX_STROKE_POINTS = 2000;
/** Pressure recorded for input that cannot report one. */
export const WHITEBOARD_PLAIN_PRESSURE = 0.5;

/** Design-token names, so each participant renders ink in their own theme. */
export const whiteboardColors = ['ink', 'blue', 'green', 'red'] as const;
export type WhiteboardColor = (typeof whiteboardColors)[number];
export type WhiteboardInput = 'pen' | 'touch' | 'mouse';

export type WhiteboardPoint = {
  /** Board units. */
  x: number;
  y: number;
  /** 0 to 1. */
  pressure: number;
  /** Degrees from -90 to 90, as the pointer reported them. */
  tiltX: number;
  tiltY: number;
  /** Milliseconds since the stroke started. */
  t: number;
};

/**
 * A stroke is complete on its own: id, author and start time travel with it, so
 * another participant's stroke can be appended to the same board unchanged.
 */
export type WhiteboardStroke = {
  id: string;
  authorId: string;
  input: WhiteboardInput;
  color: WhiteboardColor;
  /** Width, in board units, at plain pressure. */
  width: number;
  /** Epoch milliseconds. */
  startedAt: number;
  points: readonly WhiteboardPoint[];
};

const MIN_WIDTH_SCALE = 0.25;
const MAX_WIDTH_SCALE = 1.75;

/** Width of a stroke at one point. Plain pressure keeps the stroke's own width. */
export function pressureWidth(width: number, pressure: number) {
  const amount = Math.max(0, Math.min(1, pressure));
  return (
    width * (MIN_WIDTH_SCALE + (MAX_WIDTH_SCALE - MIN_WIDTH_SCALE) * amount)
  );
}
