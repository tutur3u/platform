import { ms, principal, ref, uuid } from '@tuturuuu/fleet-board-schemas';
import { z } from 'zod';

export {
  key,
  messages,
  ms,
  principal,
  uuid,
} from '@tuturuuu/fleet-board-schemas';

export const role = z.enum(['reader', 'writer', 'operator']);
export const slug = z
  .string()
  .max(100)
  .regex(/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/);

export const target = z.strictObject({
  kind: z.enum(['t3_thread', 'desk', 'webhook']),
  ref,
});
export const followup = z.discriminatedUnion('kind', [
  z.strictObject({
    dueAt: ms,
    kind: z.literal('verify_task'),
    payload: z.strictObject({ expected: z.literal('done') }),
  }),
  z.strictObject({
    dueAt: ms,
    kind: z.literal('notify'),
    payload: z.strictObject({ target }),
  }),
]);
export const watcher = z
  .strictObject({
    channelId: uuid.optional(),
    labelId: uuid.optional(),
    eventMask: z.int().min(1).max(63),
    target,
  })
  .refine((value) => !!(value.channelId || value.labelId));
export const ttl = z.int().min(30_000).max(600_000).default(300_000);
export const identity = z
  .strictObject({
    kid: z.enum(['a', 'b']),
    workspaceId: uuid,
    boardId: uuid,
    userId: uuid,
    actor: principal,
    manager: z.boolean(),
    agentActive: z.boolean(),
    issuedAt: ms,
    expiresAt: ms,
  })
  .refine(
    (value) =>
      value.actor === `user:${value.userId}` ||
      (value.actor.startsWith('agent:') && !value.manager)
  );
export type Identity = z.infer<typeof identity>;

export const job = z.strictObject({
  workspaceId: uuid,
  boardId: uuid,
  id: uuid,
  attempt: z.int().min(1).max(3),
  generation: ms,
});
export type Job = z.infer<typeof job>;
