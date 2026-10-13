import { createHash } from 'node:crypto';
import { z } from 'zod';

export class OperationalError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}
export const slug = z.string().regex(/^[a-z][a-z0-9-]{2,79}$/);
export const text = z
  .string()
  .min(1)
  .max(32_768)
  .refine((value) => value.trim().length > 0, 'nonblank string required');
export const strings = z
  .array(text)
  .max(10_000)
  .refine((v) => new Set(v).size === v.length, 'unique strings required');
export const statuses = [
  'captured',
  'ready',
  'active',
  'blocked',
  'implemented',
  'verified',
  'deferred',
] as const;
export const statusSchema = z.enum(statuses);
const sha = z.string().regex(/^[0-9a-f]{40}$/);
export const unitSchema = z
  .object({
    id: text,
    owner: text,
    worktree: text,
    head: sha,
    state: z.enum(['active', 'blocked', 'handoff', 'merged', 'delivered']),
    requiredEvidence: strings.refine((v) => v.length > 0),
    evidence: z
      .array(
        z
          .object({
            kind: text,
            head: sha,
            result: z.enum(['pending', 'pass', 'fail', 'skipped']),
            receipt: text,
          })
          .strict()
      )
      .default([]),
  })
  .strict();
export const boardSchema = z
  .object({
    version: z.literal(1),
    units: z.array(unitSchema).min(1).max(10_000),
  })
  .strict();
export type Board = z.infer<typeof boardSchema>;
export const dispositionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('open') }).strict(),
  z.object({ kind: z.literal('closed'), reason: text }).strict(),
  z
    .object({
      kind: z.literal('duplicate'),
      canonicalId: slug,
      mergeOperationId: z.uuid(),
      reason: text,
    })
    .strict(),
]);
export const graphMetadataSchema = z
  .object({
    version: z.literal(1),
    parentId: slug.optional(),
    relatedIds: z
      .array(slug)
      .max(10_000)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    disposition: dispositionSchema,
  })
  .strict();
export const intakeItemSchema = z
  .object({
    id: slug,
    title: text,
    kind: z.enum(['bug', 'feature', 'improvement', 'idea', 'delivery']),
    source: text,
    acceptance: text,
    priority: z.number().int().min(0).max(3).default(2),
    dependencies: strings.default([]),
    requiredEvidence: strings.refine((v) => v.length > 0),
    status: z.literal('captured').optional(),
  })
  .strict();
export const itemSchema = intakeItemSchema
  .omit({ status: true })
  .extend({
    priority: intakeItemSchema.shape.priority.removeDefault().optional(),
    dependencies: intakeItemSchema.shape.dependencies
      .removeDefault()
      .optional(),
    status: statusSchema,
    owner: z.string().max(32_768),
    links: strings,
    note: z.string().max(32_768),
    verification: boardSchema.optional(),
    invalidatedDependencies: strings.optional(),
    graph: graphMetadataSchema.optional(),
  })
  .strict();
export type Item = z.infer<typeof itemSchema>;
export const eventSchema = z
  .object({
    seq: z.number().int().positive(),
    item_id: slug,
    at: text,
    action: text,
    payload: z.string().max(1_048_576),
  })
  .strict();
export type Event = z.infer<typeof eventSchema>;
export const noteSchema = z
  .object({
    id: slug,
    scope: text,
    project: text,
    source: text,
    summary: text,
    evidence: strings,
    status: z.enum(['active', 'superseded', 'tombstone']),
  })
  .strict();
export type Note = z.infer<typeof noteSchema>;
export const noteEventSchema = eventSchema;
export const operationSchema = z
  .object({
    operationId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type Operation = z.infer<typeof operationSchema>;
export const updateSchema = z
  .object({
    id: slug,
    status: statusSchema.optional(),
    owner: z.string().max(32_768).optional(),
    note: z.string().max(32_768).optional(),
    link: text.optional(),
    priority: z.number().int().min(0).max(3).optional(),
    evidence: boardSchema.optional(),
  })
  .strict();
export type Update = z.infer<typeof updateSchema>;

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined)
    throw new OperationalError(
      'INVALID_INPUT',
      'undefined values cannot be persisted'
    );
  return encoded;
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function parseJson(value: string): unknown {
  return JSON.parse(value);
}
export function fail(code: string, message: string): never {
  throw new OperationalError(code, message);
}
