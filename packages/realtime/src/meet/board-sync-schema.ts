import { z } from 'zod';

/**
 * Protocol, ticket and budgets for the persistent Meet whiteboard. The room
 * Durable Object relays Excalidraw element changes between participants and
 * flushes the merged scene to `workspace_whiteboards.snapshot`.
 */
export const BOARD_TICKET_AUDIENCE = 'tuturuuu.meet.whiteboard';

export const BOARD_LIMITS = {
  /** Live elements, deleted tombstones included. */
  maxElements: 2000,
  maxElementBytes: 65_536,
  maxSnapshotBytes: 2_000_000,
  maxMessageBytes: 1_000_000,
  chunkBytes: 256_000,
  maxChangesPerMessage: 200,
  maxSockets: 50,
  /** Client messages per socket per second. */
  messageRate: 40,
  /** Seconds a join ticket stays valid; clients refresh it from the Meet API. */
  ticketTtlSeconds: 120,
  /** Delay between the first unsaved edit and the write to Durable Object storage. */
  persistWindowMs: 5000,
  /** Delay between the first unflushed edit and the write to the database. */
  flushWindowMs: 15_000,
  /** Delay between the last participant leaving and the final flush. */
  idleFlushMs: 1000,
  /** Cadence of the ticket-expiry sweep while anyone is connected. */
  sweepMs: 60_000,
} as const;

/** A flush stops after this many failed or conflicting attempts per outage. */
export const BOARD_FLUSH_RETRY = {
  maxAttempts: 3,
  maxAgeMs: 120_000,
  delayMs: 30_000,
} as const;

export const boardRoleSchema = z.enum(['edit', 'view']);
export type BoardRole = z.infer<typeof boardRoleSchema>;

export const boardGuestAccessSchema = z.enum(['none', 'view', 'draw']);
export type BoardGuestAccess = z.infer<typeof boardGuestAccessSchema>;

/**
 * `join` opens the room socket and is minted by the Meet API after it proved
 * the actor. `checkpoint` is minted by the room itself and authorizes its two
 * platform calls (load and flush) for exactly one board.
 */
export const boardTicketSchema = z
  .object({
    aud: z.literal(BOARD_TICKET_AUDIENCE),
    kind: z.enum(['join', 'checkpoint']),
    meetingId: z.uuid(),
    wsId: z.uuid(),
    boardId: z.uuid(),
    actorKind: z.enum(['member', 'guest', 'system']),
    userId: z.string().min(1).max(128),
    displayName: z.string().max(120),
    role: boardRoleSchema,
    exp: z.number().int().positive(),
  })
  .strict();
export type BoardTicket = z.infer<typeof boardTicketSchema>;

/** Excalidraw element kinds the board accepts. Images need file storage the room lacks. */
export const BOARD_ELEMENT_TYPES = [
  'rectangle',
  'diamond',
  'ellipse',
  'arrow',
  'line',
  'freedraw',
  'text',
  'frame',
  'magicframe',
] as const;

export function byteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export const boardElementSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.enum(BOARD_ELEMENT_TYPES),
    version: z.number().int().nonnegative(),
    versionNonce: z.number().int(),
    isDeleted: z.boolean().optional(),
  })
  .passthrough()
  .refine((element) => byteLength(element) <= BOARD_LIMITS.maxElementBytes, {
    message: 'Element exceeds budget',
  });
export type BoardElement = z.infer<typeof boardElementSchema>;

const boardChangeSchema = z
  .object({
    type: z.enum(['insert', 'update', 'delete']),
    element: boardElementSchema,
  })
  .strict();
export type BoardChange = z.infer<typeof boardChangeSchema>;

const finite = z.number().finite();
const selectionSchema = z
  .record(z.string().max(64), z.boolean())
  .refine((value) => Object.keys(value).length <= 500);

export const boardClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('authenticate'), token: z.string().max(16_384) }),
  z.object({ type: z.literal('sync') }),
  z.object({
    type: z.literal('elements'),
    changes: z.array(boardChangeSchema).min(1).max(BOARD_LIMITS.maxChangesPerMessage),
    timestamp: finite.optional(),
  }),
  z.object({
    type: z.literal('cursor'),
    x: finite,
    y: finite,
    tool: z.string().max(24).optional(),
  }),
  z.object({ type: z.literal('selection'), selectedElementIds: selectionSchema }),
]);
export type BoardClientMessage = z.infer<typeof boardClientMessage>;

export const boardMemberSchema = z.object({
  id: z.string().max(128),
  displayName: z.string().max(120),
  role: boardRoleSchema,
});
export type BoardMember = z.infer<typeof boardMemberSchema>;

export const boardServerMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('sync'),
    elements: z.array(z.unknown()),
    chunk: z.number().int().nonnegative(),
    chunks: z.number().int().positive(),
    role: boardRoleSchema,
  }),
  z.object({
    type: z.literal('elements'),
    senderId: z.string(),
    changes: z.array(boardChangeSchema),
    timestamp: finite,
  }),
  z.object({
    type: z.literal('cursor'),
    senderId: z.string(),
    displayName: z.string(),
    x: finite,
    y: finite,
    tool: z.string().optional(),
  }),
  z.object({
    type: z.literal('selection'),
    senderId: z.string(),
    selectedElementIds: selectionSchema,
    timestamp: finite,
  }),
  z.object({ type: z.literal('presence'), members: z.array(boardMemberSchema) }),
  z.object({ type: z.literal('role'), role: boardRoleSchema }),
  z.object({ type: z.literal('saved'), revision: z.number().int() }),
  z.object({ type: z.literal('save-error') }),
  z.object({ type: z.literal('closed') }),
]);
export type BoardServerMessage = z.infer<typeof boardServerMessage>;

/** The scene a flush stores: elements plus the board's existing app state. */
export const boardCheckpointBodySchema = z
  .object({
    elements: z.array(boardElementSchema).max(BOARD_LIMITS.maxElements),
    revision: z.number().int().nonnegative(),
    baseUpdatedAt: z.string().max(64).nullable(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type BoardCheckpointBody = z.infer<typeof boardCheckpointBodySchema>;

/** What the platform answers to a load (GET) or a flush (POST). */
export const boardCheckpointResultSchema = z.object({
  updatedAt: z.string().max(64),
  elements: z.array(boardElementSchema).max(BOARD_LIMITS.maxElements).optional(),
});
export type BoardCheckpointResult = z.infer<typeof boardCheckpointResultSchema>;
