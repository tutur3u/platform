import { z } from 'zod';

export const workspaceSecretWriteSchema = z
  .object({
    name: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();

/**
 * Updates either replace the value or keep the stored one (`keepValue`), so a
 * withheld credential can be renamed without being sent again.
 */
export const workspaceSecretUpdateSchema = z.union([
  workspaceSecretWriteSchema,
  z
    .object({
      keepValue: z.literal(true),
      name: z.string().min(1),
    })
    .strict(),
]);
