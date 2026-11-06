import type { ExtendedWorkspaceTask } from '@tuturuuu/ui/time-tracker/types';
import { z } from 'zod';

const optionalJsonValue = z.json().optional();

/** A smart-scheduling task whose untyped columns are proven JSON values. */
export type SchedulingTaskTransport = Omit<
  ExtendedWorkspaceTask,
  'embedding' | 'fts'
> & {
  embedding: z.infer<typeof optionalJsonValue>;
  fts: z.infer<typeof optionalJsonValue>;
};

/**
 * Narrows a task for a serialized page model (TanStack Start server
 * functions): `embedding` and `fts` are typed `unknown` by the database
 * types, so they are validated as JSON instead of waiving serialization.
 */
export function schedulingTaskTransport(
  task: ExtendedWorkspaceTask
): SchedulingTaskTransport {
  return {
    ...task,
    embedding: optionalJsonValue.parse(task.embedding),
    fts: optionalJsonValue.parse(task.fts),
  };
}
