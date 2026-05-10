import { z } from 'zod';

const vectorSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

const worldSchema = z.object({
  blocks: z.array(
    z.object({
      id: z.string().min(1),
      position: vectorSchema,
      type: z.string().min(1),
    })
  ),
  objects: z.array(
    z.object({
      id: z.string().min(1),
      position: vectorSchema,
      rotation: z.number().optional(),
      type: z.string().min(1),
    })
  ),
});

export const hiveRealtimeClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    eventType: z
      .enum([
        'block.place',
        'block.remove',
        'object.place',
        'object.remove',
        'object.move',
        'npc.move',
        'npc.config',
        'npc.decision',
        'server.metadata',
      ])
      .or(z.string().min(1).max(80)),
    expectedRevision: z.number().int().min(0),
    payload: z.record(z.string(), z.unknown()).default({}),
    type: z.literal('world.event'),
    world: worldSchema,
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
  z.object({
    type: z.literal('presence.join'),
    userId: z.string().uuid().optional(),
  }),
]);

export type HiveRealtimeClientMessage = z.infer<
  typeof hiveRealtimeClientMessageSchema
>;
