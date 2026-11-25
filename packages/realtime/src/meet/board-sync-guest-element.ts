import { z } from 'zod';
import { BOARD_ELEMENT_TYPES } from './board-sync-schema';

// `z.number()` refuses NaN and infinities, so every number here is finite.
const num = z.number();
const id = z.string().min(1).max(64);
const color = z.string().max(64);
const text = z.string().max(20_000);
const point = z.tuple([num, num]);
const binding = z
  .object({
    elementId: id,
    focus: num.optional(),
    gap: num.optional(),
    fixedPoint: point.nullable().optional(),
  })
  .nullable();
const arrowhead = z.string().max(32).nullable();

/**
 * The Excalidraw 0.18 element a person outside the workspace may store, field
 * by field: finite numbers, bounded strings, the drawing enums and capped
 * arrays. Unknown keys (`customData` included) are dropped, and an element
 * whose known fields have the wrong type or size is refused as a whole, so a
 * malformed element never reaches the other people's editors or the stored
 * scene.
 */
export const guestElementSchema = z.object({
  id,
  type: z.enum(BOARD_ELEMENT_TYPES),
  version: z.number().int().nonnegative(),
  versionNonce: z.number().int(),
  isDeleted: z.boolean().optional(),
  x: num.optional(),
  y: num.optional(),
  width: num.optional(),
  height: num.optional(),
  angle: num.optional(),
  strokeColor: color.optional(),
  backgroundColor: color.optional(),
  fillStyle: z.enum(['hachure', 'cross-hatch', 'solid', 'zigzag']).optional(),
  strokeWidth: num.optional(),
  strokeStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
  roundness: z
    .object({ type: z.number().int(), value: num.optional() })
    .nullable()
    .optional(),
  roughness: num.optional(),
  opacity: z.number().min(0).max(100).optional(),
  seed: z.number().int().optional(),
  index: z.string().max(64).nullable().optional(),
  groupIds: z.array(id).max(32).optional(),
  frameId: id.nullable().optional(),
  boundElements: z
    .array(z.object({ id, type: z.enum(['arrow', 'text']) }))
    .max(256)
    .nullable()
    .optional(),
  updated: num.optional(),
  link: z.string().max(2048).nullable().optional(),
  locked: z.boolean().optional(),
  text: text.optional(),
  originalText: text.optional(),
  fontSize: z.number().positive().max(1000).optional(),
  fontFamily: z.number().int().optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  containerId: id.nullable().optional(),
  autoResize: z.boolean().optional(),
  lineHeight: num.optional(),
  baseline: num.optional(),
  points: z.array(point).max(10_000).optional(),
  lastCommittedPoint: point.nullable().optional(),
  startBinding: binding.optional(),
  endBinding: binding.optional(),
  startArrowhead: arrowhead.optional(),
  endArrowhead: arrowhead.optional(),
  elbowed: z.boolean().optional(),
  fixedSegments: z
    .array(z.object({ start: point, end: point, index: z.number().int() }))
    .max(256)
    .nullable()
    .optional(),
  startIsSpecial: z.boolean().nullable().optional(),
  endIsSpecial: z.boolean().nullable().optional(),
  polygon: z.boolean().optional(),
  pressures: z.array(num).max(10_000).optional(),
  simulatePressure: z.boolean().optional(),
  name: z.string().max(256).nullable().optional(),
});
