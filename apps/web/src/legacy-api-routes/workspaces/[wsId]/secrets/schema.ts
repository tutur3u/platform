import { z } from 'zod';

export const workspaceSecretWriteSchema = z
  .object({
    name: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();
