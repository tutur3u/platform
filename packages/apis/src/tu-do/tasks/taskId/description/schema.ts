import { MAX_TASK_DESCRIPTION_LENGTH } from '@tuturuuu/utils/constants';
import {
  isValidTaskDescriptionContent,
  isValidTaskDescriptionYjsState,
} from '@tuturuuu/utils/yjs-task-description';
import { z } from 'zod';

export const paramsSchema = z.object({
  wsId: z.string().min(1),
  taskId: z.guid(),
});

export const updateTaskDescriptionSchema = z
  .object({
    description: z
      .string()
      .max(MAX_TASK_DESCRIPTION_LENGTH)
      .nullable()
      .optional()
      .refine(isValidTaskDescriptionContent, {
        message: 'Task description is not compatible with the editor schema',
      }),
    description_yjs_state: z
      .array(z.number().int().min(0).max(255))
      .nullable()
      .optional()
      .refine(isValidTaskDescriptionYjsState, {
        message:
          'Task description Yjs state is not compatible with the editor schema',
      }),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one description field is required',
  });
