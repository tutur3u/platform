import { z } from 'zod';
import { getHiveObjectStateFootprintValidationError } from './footprint';

export {
  getHiveAgentDestructiveWorldAction,
  type HiveDestructiveWorldAction,
  isHiveAdminWorldEvent,
} from './agent';
export {
  getHiveObjectStateFootprintValidationError,
  type HiveObjectFootprint,
  type HiveObjectStateFootprintValidationError,
  MAX_HIVE_OBJECT_FOOTPRINT_CELLS,
  MAX_HIVE_OBJECT_FOOTPRINT_DIMENSION,
  normalizeHiveObjectFootprint,
} from './footprint';

export const hiveVectorSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

const hiveObjectStateSchema = z
  .record(z.string(), z.any())
  .superRefine((state, ctx) => {
    const error = getHiveObjectStateFootprintValidationError(state);

    if (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error.message,
        path: error.path,
      });
    }
  });

export const hiveWorldSchema = z.object({
  blocks: z.array(
    z.object({
      id: z.string().min(1),
      position: hiveVectorSchema,
      state: z.record(z.string(), z.any()).optional(),
      type: z.string().min(1),
    })
  ),
  objects: z.array(
    z.object({
      id: z.string().min(1),
      position: hiveVectorSchema,
      rotation: z.number().optional(),
      state: hiveObjectStateSchema.optional(),
      type: z.string().min(1),
    })
  ),
});

export type HiveRealtimeWorld = z.infer<typeof hiveWorldSchema>;

export const hiveRealtimeAwarenessSchema = z.object({
  activeTool: z.string().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  camera: hiveVectorSchema.optional(),
  color: z.string().min(1).max(40),
  cursor: hiveVectorSchema.nullable().optional(),
  displayName: z.string().min(1).max(120),
  focus: z.enum(['editor', 'inspector', 'npc-lab', 'settings']).optional(),
  lastSeenAt: z.string(),
  role: z.enum(['admin', 'member', 'researcher']).default('member'),
  selection: z
    .object({
      id: z.string(),
      kind: z.string(),
    })
    .nullable()
    .optional(),
  userId: z.string().uuid(),
  worldPosition: hiveVectorSchema.nullable().optional(),
});

export type HiveRealtimeAwareness = z.infer<typeof hiveRealtimeAwarenessSchema>;

const eventSchema = z.object({
  actorUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
  eventType: z.string().min(1),
  id: z.string().uuid(),
  payload: z.record(z.string(), z.any()).default({}),
  revision: z.number().int().min(0),
  serverId: z.string().uuid(),
});

export const hiveRealtimeClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    stateVector: z.string().optional(),
    type: z.literal('sync.hello'),
  }),
  z.object({
    clientId: z.string().optional(),
    stateVector: z.string().optional(),
    type: z.literal('sync.update'),
    update: z.string().min(1),
    world: hiveWorldSchema.optional(),
  }),
  z.object({
    awareness: hiveRealtimeAwarenessSchema,
    type: z.literal('awareness.update'),
  }),
  z.object({
    type: z.literal('presence.join'),
    userId: z.string().uuid().optional(),
  }),
  z.object({
    eventType: z.string().min(1).max(80),
    expectedRevision: z.number().int().min(0),
    payload: z.record(z.string(), z.any()).default({}),
    type: z.literal('world.event'),
    world: hiveWorldSchema,
  }),
  z.object({
    selection: z
      .object({
        id: z.string(),
        kind: z.string(),
      })
      .nullable(),
    type: z.literal('selection'),
  }),
]);

export type HiveRealtimeClientMessage = z.infer<
  typeof hiveRealtimeClientMessageSchema
>;

export type HiveRealtimeServerMessage =
  | {
      opSeq: number;
      stateVector?: string | null;
      type: 'sync.update';
      update: string;
      world?: HiveRealtimeWorld;
    }
  | {
      opSeq: number;
      state?: string | null;
      stateVector?: string | null;
      type: 'sync.snapshot';
      world: HiveRealtimeWorld;
    }
  | {
      awareness: HiveRealtimeAwareness[];
      serverId: string;
      type: 'presence';
    }
  | {
      awareness: HiveRealtimeAwareness;
      type: 'awareness.update';
    }
  | {
      event: z.infer<typeof eventSchema>;
      type: 'world.event';
      world?: HiveRealtimeWorld;
    }
  | {
      error: string;
      type: 'error';
    };

type BufferConstructorLike = {
  from(value: string, encoding: 'base64'): Uint8Array;
  from(value: Uint8Array): { toString(encoding: 'base64'): string };
};

function getBufferConstructor() {
  return (globalThis as unknown as { Buffer?: BufferConstructorLike }).Buffer;
}

export function bytesToBase64(value: Uint8Array) {
  const BufferConstructor = getBufferConstructor();
  if (BufferConstructor) {
    return BufferConstructor.from(value).toString('base64');
  }

  let binary = '';
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const BufferConstructor = getBufferConstructor();
  if (BufferConstructor) {
    return new Uint8Array(BufferConstructor.from(value, 'base64'));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
