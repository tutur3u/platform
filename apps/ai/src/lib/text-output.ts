import { jsonSchema, Output } from 'ai';
import { z } from 'zod';

export const responseFormatSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text') }),
  z.object({ type: z.literal('json_object') }),
  z.object({
    type: z.literal('json_schema'),
    json_schema: z.object({
      name: z.string().min(1).max(64),
      description: z.string().max(4_000).optional(),
      strict: z.boolean().optional(),
      schema: z
        .record(z.string(), z.unknown())
        .refine(
          (value) => JSON.stringify(value).length <= 100_000,
          'The output schema is too large.'
        ),
    }),
  }),
]);

export type ResponseFormat = z.infer<typeof responseFormatSchema>;

export function textOutput(format?: ResponseFormat) {
  if (format?.type === 'json_object') return Output.json();
  if (format?.type === 'json_schema') {
    return Output.object({
      name: format.json_schema.name,
      description: format.json_schema.description,
      schema: jsonSchema(format.json_schema.schema),
    });
  }
  return Output.text();
}
