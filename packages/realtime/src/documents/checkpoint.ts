import { z } from 'zod';
export const DOCUMENT_CHECKPOINT_EVENT = 'document-checkpoint';
export const documentCheckpointSchema = z
  .object({
    status: z.enum(['saved', 'deferred', 'conflict']),
    version: z.number().int().nonnegative(),
  })
  .strict();
export type DocumentCheckpointStatus = z.infer<
  typeof documentCheckpointSchema
>['status'];
