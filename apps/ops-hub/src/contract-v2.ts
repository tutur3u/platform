import { z } from 'zod';
import { text, timestamp, UNSAFE } from './fields';

const stableId = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const atom = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)
    .refine((value) => !UNSAFE.test(value));
const model = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_./:-]*$/)
  .refine((value) => !UNSAFE.test(value));
const count = z.number().int().min(0).max(1_000_000);
export const categorySchema = z.enum(['auto', 'delegated', 'user']);
const decisionFields = {
  id: stableId,
  at: timestamp,
  title: text(120),
  risk: z.enum(['low', 'med', 'high']),
};
const author = z
  .union([
    z.literal('mastermind'),
    z.literal('user'),
    z.string().regex(/^role:[a-zA-Z0-9 _-]{1,32}$/),
  ])
  .refine((value) => !UNSAFE.test(value));
export const decisionSchema = z
  .discriminatedUnion('area', [
    z.strictObject({
      ...decisionFields,
      area: z.literal('security'),
      by: author.optional(),
      category: categorySchema.optional(),
      why: text(280).optional(),
      reversible: z.boolean().optional(),
    }),
    z.strictObject({
      ...decisionFields,
      area: z.enum(['release', 'product', 'infra', 'org', 'quota', 'cost']),
      by: author,
      category: categorySchema,
      why: text(280),
      reversible: z.boolean(),
    }),
  ])
  .transform((row) =>
    row.area === 'security'
      ? {
          id: row.id,
          at: row.at,
          title: row.title,
          area: row.area,
          risk: row.risk,
        }
      : row
  );
export type Decision = z.infer<typeof decisionSchema>;
export const observabilitySchema = z.strictObject({
  quota_series: z
    .array(
      z.strictObject({
        instance: atom(64),
        t: timestamp,
        pct: z.number().min(0).max(100),
      })
    )
    .max(100),
  speed_series: z
    .array(
      z.strictObject({
        model,
        t: timestamp,
        tok_s_p50: z.number().min(0).max(1_000_000),
      })
    )
    .max(100),
  children_series: z
    .array(
      z.strictObject({
        t: timestamp,
        provider: atom(32),
        model,
        running: count,
        started: count,
        finished: count,
      })
    )
    .max(100),
  staff: z
    .array(
      z.strictObject({
        role: atom(64),
        title: text(120),
        state: z.enum([
          'idle',
          'queued',
          'running',
          'waiting',
          'success',
          'failed',
          'held',
          'paused',
          'stopped',
          'unknown',
        ]),
        last_active: timestamp,
        model,
        runs_today: count,
      })
    )
    .max(100)
    .refine(
      (rows) => new Set(rows.map((row) => row.role)).size === rows.length
    ),
  ci: z
    .array(
      z.strictObject({
        repo: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/)
          .refine((value) => !UNSAFE.test(value)),
        t: timestamp,
        queued: count,
        running: count,
      })
    )
    .max(100),
  cadence: z
    .array(
      z.strictObject({ product: atom(64), last_prod_at: timestamp.nullable() })
    )
    .max(40)
    .refine(
      (rows) => new Set(rows.map((row) => row.product)).size === rows.length
    ),
});
export type Observability = z.infer<typeof observabilitySchema>;
export const seriesSchema = z.enum([
  'quota_series',
  'speed_series',
  'children_series',
  'staff',
  'ci',
  'cadence',
]);
export type Series = z.infer<typeof seriesSchema>;
