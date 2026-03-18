import { MAX_TASK_DESCRIPTION_LENGTH } from '@tuturuuu/utils/constants';
import { z } from 'zod';

export const paramsSchema = z.object({
  wsId: z.string().min(1),
  taskId: z.uuid(),
});

export const updateTaskDescriptionSchema = z
  .object({
    description: z
      .string()
      .max(MAX_TASK_DESCRIPTION_LENGTH)
      .nullable()
      .optional(),
    description_yjs_state: z
      .array(z.number().int().min(0).max(255))
      .nullable()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one description field is required',
  });
