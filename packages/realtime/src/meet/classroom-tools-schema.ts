import { z } from 'zod';

export const MEET_CLASSROOM_TOOLS_SCOPE = 'meet:classroom-tools';
export const MAX_CLASSROOM_COMMAND_BYTES = 8192;
export const BOARD_WIDTH = 900;
export const BOARD_HEIGHT = 460;
export const MAX_STROKE_POINTS = 180;
export const MAX_BREAKOUT_GROUPS = 12;
export const MAX_BREAKOUT_DURATION_MINUTES = 60;

export const boardColors = ['ink', 'blue', 'green', 'red'] as const;
const anchor = {
  x: z.number().int().min(0).max(BOARD_WIDTH),
  y: z.number().int().min(0).max(BOARD_HEIGHT),
};
const point = z.tuple([anchor.x, anchor.y]);
const shape = { id: z.uuid(), color: z.enum(boardColors) };
const label = z.string().trim().min(1).max(60);
const itemSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...shape,
    kind: z.literal('stroke'),
    points: z.array(point).min(1).max(MAX_STROKE_POINTS),
    width: z.number().min(1).max(8),
  }),
  z.strictObject({ ...shape, ...anchor, kind: z.literal('shape') }),
  z.strictObject({ ...shape, ...anchor, kind: z.literal('text'), label }),
  z.strictObject({ ...shape, ...anchor, kind: z.literal('sticky'), label }),
]);

export type BoardItem = z.infer<typeof itemSchema>;
export type BoardPoint = z.infer<typeof point>;
export const breakoutModes = ['auto', 'manual', 'student_pick'] as const;
export type BreakoutMode = (typeof breakoutModes)[number];

const group = { groupId: z.number().int().min(1).max(MAX_BREAKOUT_GROUPS) };
const session = { sessionId: z.uuid() };
export const classroomMutationSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('whiteboard.draw'), item: itemSchema }),
  z.strictObject({ action: z.literal('whiteboard.undo') }),
  z.strictObject({ action: z.literal('whiteboard.clear') }),
  z.strictObject({
    action: z.literal('breakouts.create'),
    ...session,
    mode: z.enum(breakoutModes),
    roomCount: z.number().int().min(2).max(MAX_BREAKOUT_GROUPS),
    durationMinutes: z.number().int().min(1).max(MAX_BREAKOUT_DURATION_MINUTES),
  }),
  z.strictObject({
    action: z.literal('breakouts.assign'),
    ...session,
    participantId: z.uuid(),
    groupId: group.groupId.nullable(),
  }),
  z.strictObject({ action: z.literal('breakouts.join'), ...session, ...group }),
  z.strictObject({
    action: z.literal('breakouts.help'),
    ...session,
    ...group,
    requested: z.boolean(),
  }),
  z.strictObject({
    action: z.literal('breakouts.broadcast'),
    ...session,
    message: z.string().trim().min(1).max(300),
  }),
  z.strictObject({ action: z.literal('breakouts.extend'), ...session }),
  z.strictObject({ action: z.literal('breakouts.close'), ...session }),
]);

export type ClassroomMutation = z.infer<typeof classroomMutationSchema>;
export const classroomReadSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('whiteboard.read'),
    since: z.uuid().optional(),
  }),
  z.strictObject({ action: z.literal('breakouts.read') }),
]);
