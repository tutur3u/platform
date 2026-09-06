import { jsonSchema, Output } from 'ai';
import { z } from 'zod';

const strictValidators = new WeakMap<object, z.ZodType>();
function strictValidator(schema: Record<string, unknown>) {
  const existing = strictValidators.get(schema);
  if (existing) return existing;
  const validator = z.fromJSONSchema(schema);
  strictValidators.set(schema, validator);
  return validator;
}

export const responseFormatSchema = z
  .discriminatedUnion('type', [
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
  ])
  .superRefine((format, context) => {
    if (format.type !== 'json_schema' || !format.json_schema.strict) return;
    try {
      strictValidator(format.json_schema.schema);
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'The strict output schema is not supported.',
      });
    }
  });

export type ResponseFormat = z.infer<typeof responseFormatSchema>;

export function textOutput(format?: ResponseFormat) {
  if (format?.type === 'json_object') return Output.json();
  if (format?.type === 'json_schema') {
    const validator = format.json_schema.strict
      ? strictValidator(format.json_schema.schema)
      : null;
    return Output.object({
      name: format.json_schema.name,
      description: format.json_schema.description,
      schema: jsonSchema(
        format.json_schema.schema,
        validator
          ? {
              validate: (value) => {
                const result = validator.safeParse(value);
                return result.success
                  ? { success: true, value: result.data }
                  : { success: false, error: result.error };
              },
            }
          : undefined
      ),
    });
  }
  return Output.text();
}
