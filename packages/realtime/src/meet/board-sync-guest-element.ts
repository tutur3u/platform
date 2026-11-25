import { z } from 'zod';
import { elementRenderCost } from './board-sync-cost';

// `z.number()` refuses NaN and infinities; every number below also has a
// range, so no guest value can make a viewer draw without bound.
const range = (min: number, max: number) => z.number().min(min).max(max);
const integer = (min: number, max: number) =>
  z.number().int().min(min).max(max);
const RANDOM_MAX = 2 ** 31;
const coordinate = range(-1e6, 1e6);
// Excalidraw caches each element on a canvas of up to 16.7M pixels; a guest
// shape's sides stay within 10,000 and the scene caps the total area.
const size = range(0, 1e4);
const pointValue = range(-1e5, 1e5);
const id = z.string().min(1).max(64);
const color = z.string().max(64);
const text = z.string().max(20_000);
const point = z.tuple([pointValue, pointValue]);
const points = z.array(point).max(10_000);
const binding = z
  .object({
    elementId: id,
    focus: range(-1, 1).optional(),
    gap: range(0, 1e4).optional(),
    // A ratio of the bound element's box; elbow arrows may sit just outside.
    fixedPoint: z
      .tuple([range(-1, 2), range(-1, 2)])
      .nullable()
      .optional(),
  })
  .nullable();
const arrowhead = z.string().max(32).nullable();

/**
 * Render cost one guest element may carry (`elementRenderCost`); a normal
 * shape costs a few hundred at most. The room also caps the whole scene's
 * render cost and cached canvas area (`BOARD_GUEST_LIMITS.maxSceneCost`,
 * `maxSceneCanvasPixels`).
 */
export const MAX_GUEST_ELEMENT_COST = 10_000;
/** Lines of text one guest text element may hold. */
export const MAX_GUEST_TEXT_LINES = 500;

/**
 * Fields every element type draws from. Excalidraw reads them without
 * defaults on remote elements (no restore runs on a live scene), so a
 * missing one can crash or hang every viewer; all are required.
 */
const shared = {
  id,
  version: integer(0, RANDOM_MAX),
  versionNonce: integer(-RANDOM_MAX, RANDOM_MAX),
  x: coordinate,
  y: coordinate,
  width: size,
  height: size,
  angle: range(-8 * Math.PI, 8 * Math.PI),
  strokeColor: color,
  backgroundColor: color,
  fillStyle: z.enum(['hachure', 'cross-hatch', 'solid', 'zigzag']),
  strokeWidth: range(0.5, 64),
  strokeStyle: z.enum(['solid', 'dashed', 'dotted']),
  roughness: range(0, 5),
  opacity: range(0, 100),
  seed: integer(0, RANDOM_MAX),
  groupIds: z.array(id).max(32),
  isDeleted: z.boolean().optional(),
  roundness: z
    .object({ type: integer(0, 16), value: range(0, 1e5).optional() })
    .nullable()
    .optional(),
  index: z.string().max(64).nullable().optional(),
  frameId: id.nullable().optional(),
  boundElements: z
    .array(z.object({ id, type: z.enum(['arrow', 'text']) }))
    .max(256)
    .nullable()
    .optional(),
  updated: range(0, 1e14).optional(),
  link: z.string().max(2048).nullable().optional(),
  locked: z.boolean().optional(),
};

/**
 * Lines and arrows, drawn along at least two points (a refinement below);
 * a deleted one may keep a single point, since removing points can leave one.
 */
const linear = {
  ...shared,
  points: points.min(1),
  lastCommittedPoint: point.nullable().optional(),
  startBinding: binding.optional(),
  endBinding: binding.optional(),
  startArrowhead: arrowhead.optional(),
  endArrowhead: arrowhead.optional(),
  elbowed: z.boolean().optional(),
  fixedSegments: z
    .array(z.object({ start: point, end: point, index: integer(0, 10_000) }))
    .max(256)
    .nullable()
    .optional(),
  startIsSpecial: z.boolean().nullable().optional(),
  endIsSpecial: z.boolean().nullable().optional(),
  polygon: z.boolean().optional(),
};

const box = (type: 'rectangle' | 'diamond' | 'ellipse') =>
  z.object({ ...shared, type: z.literal(type) });
const frame = (type: 'frame' | 'magicframe') =>
  z.object({
    ...shared,
    type: z.literal(type),
    name: z.string().max(256).nullable().optional(),
  });

/**
 * The Excalidraw 0.18 element a person outside the workspace may store, per
 * element type: every field that type draws from is required, numbers are
 * within drawing ranges, strings and arrays are bounded, a live line or arrow
 * has two points or more, text holds at most `MAX_GUEST_TEXT_LINES` lines, a
 * freehand stroke has a pressure per point or simulates pressure, and the
 * whole element costs at most `MAX_GUEST_ELEMENT_COST` to draw. Unknown keys
 * (`customData` included) and fields another type uses are dropped; an
 * element that fails any check is refused as a whole, so it never reaches the
 * other people's editors or the stored scene. The room also checks arrow
 * labels against the scene (`checkArrowLabels`).
 */
export const guestElementSchema = z
  .discriminatedUnion('type', [
    box('rectangle'),
    box('diamond'),
    box('ellipse'),
    frame('frame'),
    frame('magicframe'),
    z.object({ ...linear, type: z.literal('line') }),
    z.object({ ...linear, type: z.literal('arrow') }),
    z.object({
      ...shared,
      type: z.literal('freedraw'),
      // Excalidraw pads a freehand canvas by twelve stroke widths.
      strokeWidth: range(0.5, 16),
      points: points.min(1),
      lastCommittedPoint: point.nullable().optional(),
      pressures: z.array(range(0, 1)).max(10_000).optional(),
      simulatePressure: z.boolean().optional(),
    }),
    z.object({
      ...shared,
      type: z.literal('text'),
      text,
      originalText: text.optional(),
      // Excalidraw pads a text canvas by half the font size.
      fontSize: range(1, 256),
      fontFamily: integer(0, 1000),
      lineHeight: range(0.5, 10),
      textAlign: z.enum(['left', 'center', 'right']).optional(),
      verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
      containerId: id.nullable().optional(),
      autoResize: z.boolean().optional(),
      baseline: size.optional(),
    }),
  ])
  .refine(
    (element) =>
      (element.type !== 'line' && element.type !== 'arrow') ||
      element.isDeleted === true ||
      element.points.length >= 2,
    { message: 'Lines need two points' }
  )
  .refine(
    (element) =>
      element.type !== 'text' ||
      element.text.split('\n').length <= MAX_GUEST_TEXT_LINES,
    { message: 'Text has too many lines' }
  )
  .refine(
    // Without either, Excalidraw draws the stroke invisibly and logs an
    // error on every render.
    (element) =>
      element.type !== 'freedraw' ||
      element.simulatePressure === true ||
      element.pressures?.length === element.points.length,
    { message: 'Freehand strokes need pressures or simulated pressure' }
  )
  .refine((element) => elementRenderCost(element) <= MAX_GUEST_ELEMENT_COST, {
    message: 'Element costs too much to draw',
  });
