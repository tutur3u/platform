import { z } from 'zod';

export const processIdentitySchema = z
  .object({
    backend: z.enum(['linux-proc-v1', 'darwin-libproc-v1']),
    host: z.string().min(1).max(256),
    boot: z.string().min(1).max(256),
    namespace: z.string().min(1).max(256),
    birth: z.string().min(1).max(256),
  })
  .strict();
export type KernelProcessIdentity = z.infer<typeof processIdentitySchema>;
export const processRecordSchema = z.object({
  pid: z.number().int().positive(),
  parent: z.number().int().nonnegative(),
  // Linux kernel threads have group 0; owner group checks use positive PIDs.
  group: z.number().int().nonnegative(),
  identity: processIdentitySchema,
  zombie: z.boolean(),
});
export type ProcessRecord = z.infer<typeof processRecordSchema>;
export type ProcessContext = Omit<KernelProcessIdentity, 'birth'>;
export type ProcessObservation =
  | { kind: 'present'; process: ProcessRecord }
  | { kind: 'gone' }
  | { kind: 'unavailable'; reason: string };
export type ProcessSnapshot =
  | {
      kind: 'ready';
      processes: ProcessRecord[];
      unavailable: { pid: number; group?: number }[];
      context: ProcessContext;
      complete: boolean;
    }
  | { kind: 'unavailable'; reason: string };
export const identityEqual = (
  left: KernelProcessIdentity,
  right: KernelProcessIdentity
) =>
  left.backend === right.backend &&
  left.host === right.host &&
  left.boot === right.boot &&
  left.namespace === right.namespace &&
  left.birth === right.birth;
