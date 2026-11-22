import {
  PENBOARD_LIMITS,
  penboardColors,
  type PenboardStroke,
} from '@tuturuuu/realtime/meet';

/** Every participant draws in the same board space, whatever their panel size. */
export const WHITEBOARD_WIDTH = PENBOARD_LIMITS.width;
export const WHITEBOARD_HEIGHT = PENBOARD_LIMITS.height;
export const WHITEBOARD_MAX_STROKE_POINTS = PENBOARD_LIMITS.pointsPerStroke;
/** Stroke width, in board units, at the plain pressure of a mouse or finger. */
export const WHITEBOARD_STROKE_WIDTH = 6;
/** Pressure recorded for input that cannot report one. */
export const WHITEBOARD_PLAIN_PRESSURE = 0.5;

export const whiteboardColors = penboardColors;
export type WhiteboardStroke = PenboardStroke;
export type WhiteboardColor = PenboardStroke['color'];
export type WhiteboardInput = PenboardStroke['input'];
export type WhiteboardPoint = PenboardStroke['points'][number];

const MIN_WIDTH_SCALE = 0.25;
const MAX_WIDTH_SCALE = 1.75;

/** Width of a stroke at one point. Plain pressure keeps the stroke's own width. */
export function pressureWidth(width: number, pressure: number) {
  const amount = Math.max(0, Math.min(1, pressure));
  return (
    width * (MIN_WIDTH_SCALE + (MAX_WIDTH_SCALE - MIN_WIDTH_SCALE) * amount)
  );
}
