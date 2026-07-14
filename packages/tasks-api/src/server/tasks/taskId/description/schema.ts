import { MAX_TASK_DESCRIPTION_LENGTH } from '@tuturuuu/utils/constants';
import { isValidTaskDescriptionContent } from '@tuturuuu/utils/task-description-content';
import { z } from 'zod';

export const TASK_DESCRIPTION_CHUNK_FIELDS = [
  'description',
  'description_yjs_state',
] as const;
export const MAX_TASK_DESCRIPTION_CHUNK_TEXT_LENGTH = 196_608;
export const MAX_TASK_DESCRIPTION_YJS_STATE_BASE64_LENGTH = 2 * 1024 * 1024;
export const MAX_TASK_DESCRIPTION_CHUNKS_PER_FIELD = 64;

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
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one description field is required',
  });

function createChunkFieldPlanSchema(maxTotalLength: number) {
  return z
    .object({
      chunk_count: z
        .number()
        .int()
        .min(0)
        .max(MAX_TASK_DESCRIPTION_CHUNKS_PER_FIELD),
      total_length: z.number().int().min(0).max(maxTotalLength),
      is_null: z.boolean().optional(),
    })
    .superRefine((value, context) => {
      if (value.is_null) {
        if (value.chunk_count !== 0 || value.total_length !== 0) {
          context.addIssue({
            code: 'custom',
            message: 'Null fields must not declare chunks',
            path: ['chunk_count'],
          });
        }
        return;
      }

      if (value.chunk_count < 1) {
        context.addIssue({
          code: 'custom',
          message: 'Chunked fields require at least one chunk',
          path: ['chunk_count'],
        });
      }
    });
}

const chunkFieldsPlanSchema = z
  .object({
    description: createChunkFieldPlanSchema(
      MAX_TASK_DESCRIPTION_LENGTH
    ).optional(),
    description_yjs_state: createChunkFieldPlanSchema(
      MAX_TASK_DESCRIPTION_YJS_STATE_BASE64_LENGTH
    ).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one chunked description field is required',
  });

export const taskDescriptionChunkFieldSchema = z.enum(
  TASK_DESCRIPTION_CHUNK_FIELDS
);

export const beginTaskDescriptionChunksSchema = z.object({
  action: z.literal('begin'),
  fields: chunkFieldsPlanSchema,
});

export const appendTaskDescriptionChunkSchema = z.object({
  action: z.literal('append'),
  session_id: z.guid(),
  field: taskDescriptionChunkFieldSchema,
  chunk_index: z
    .number()
    .int()
    .min(0)
    .max(MAX_TASK_DESCRIPTION_CHUNKS_PER_FIELD - 1),
  chunk: z.string().max(MAX_TASK_DESCRIPTION_CHUNK_TEXT_LENGTH),
});

export const commitTaskDescriptionChunksSchema = z.object({
  action: z.literal('commit'),
  session_id: z.guid(),
});

export const abortTaskDescriptionChunksSchema = z.object({
  action: z.literal('abort'),
  session_id: z.guid(),
});

export const taskDescriptionChunkRequestSchema = z.discriminatedUnion(
  'action',
  [
    beginTaskDescriptionChunksSchema,
    appendTaskDescriptionChunkSchema,
    commitTaskDescriptionChunksSchema,
    abortTaskDescriptionChunksSchema,
  ]
);
