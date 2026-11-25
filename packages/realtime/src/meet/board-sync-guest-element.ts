import { z } from 'zod';
import { estimatedFillLines } from './board-sync-fill';
import { BOARD_ELEMENT_TYPES } from './board-sync-schema';

export { estimatedFillLines } from './board-sync-fill';

// `z.number()` refuses NaN and infinities; every number below also has a
// range, so no guest value can make a viewer draw without bound.
const range = (min: number, max: number) => z.number().min(min).max(max);
const integer = (min: number, max: number) =>
  z.number().int().min(min).max(max);
const RANDOM_MAX = 2 ** 31;
const coordinate = range(-1e6, 1e6);
const size = range(0, 1e5);
const pointValue = range(-1e5, 1e5);
const id = z.string().min(1).max(64);
const color = z.string().max(64);
const text = z.string().max(20_000);
const point = z.tuple([pointValue, pointValue]);
const binding = z
  .object({
    elementId: id,
    focus: range(-1, 1).optional(),
    gap: range(0, 1e4).optional(),
    // A ratio of the bound element's box; elbow arrows may sit just outside.
    fixedPoint: z.tuple([range(-1, 2), range(-1, 2)]).nullable().optional(),
  })
  .nullable();
const arrowhead = z.string().max(32).nullable();

/**
 * Fill lines one guest element may ask every viewer to draw; a normal shape
 * needs a few hundred. The room also caps the whole scene
 * (`BOARD_GUEST_LIMITS.maxSceneFillLines`).
 */
export const MAX_GUEST_FILL_LINES = 10_000;

/**
 * The Excalidraw 0.18 element a person outside the workspace may store, field
 * by field: numbers within drawing ranges, bounded strings, the drawing enums
 * and capped arrays, and a line fill of at most `MAX_GUEST_FILL_LINES`.
 * Unknown keys (`customData` included) are dropped, and an element whose known
 * fields have the wrong type, size or range is refused as a whole, so a
 * malformed element never reaches the other people's editors or the stored
 * scene.
 */
export const guestElementSchema = z
  .object({
    id,
    type: z.enum(BOARD_ELEMENT_TYPES),
    version: integer(0, RANDOM_MAX),
    versionNonce: integer(-RANDOM_MAX, RANDOM_MAX),
    isDeleted: z.boolean().optional(),
    x: coordinate.optional(),
    y: coordinate.optional(),
    width: size.optional(),
    height: size.optional(),
    angle: range(-8 * Math.PI, 8 * Math.PI).optional(),
    strokeColor: color.optional(),
    backgroundColor: color.optional(),
    fillStyle: z.enum(['hachure', 'cross-hatch', 'solid', 'zigzag']).optional(),
    strokeWidth: range(0.5, 64).optional(),
    strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
    roundness: z
      .object({ type: integer(0, 16), value: range(0, 1e5).optional() })
      .nullable()
      .optional(),
    roughness: range(0, 5).optional(),
    opacity: range(0, 100).optional(),
    seed: integer(0, RANDOM_MAX).optional(),
    index: z.string().max(64).nullable().optional(),
    groupIds: z.array(id).max(32).optional(),
    frameId: id.nullable().optional(),
    boundElements: z
      .array(z.object({ id, type: z.enum(['arrow', 'text']) }))
      .max(256)
      .nullable()
      .optional(),
    updated: range(0, 1e14).optional(),
    link: z.string().max(2048).nullable().optional(),
    locked: z.boolean().optional(),
    text: text.optional(),
    originalText: text.optional(),
    fontSize: range(1, 2048).optional(),
    fontFamily: integer(0, 1000).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
    containerId: id.nullable().optional(),
    autoResize: z.boolean().optional(),
    lineHeight: range(0.5, 10).optional(),
    baseline: size.optional(),
    points: z.array(point).max(10_000).optional(),
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
    pressures: z.array(range(0, 1)).max(10_000).optional(),
    simulatePressure: z.boolean().optional(),
    name: z.string().max(256).nullable().optional(),
  })
  .refine((element) => estimatedFillLines(element) <= MAX_GUEST_FILL_LINES, {
    message: 'Fill draws too many lines',
  });
