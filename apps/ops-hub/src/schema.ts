import { z } from 'zod';
import { decisionSchema, observabilitySchema } from './contract-v2';
import { orgSchema } from './contract-v3';
import { id, SECURITY, text, timestamp } from './fields';

const state = z.enum([
  'queued',
  'running',
  'success',
  'failed',
  'held',
  'unknown',
]);
const severity = z.enum(['info', 'low', 'medium', 'high', 'critical']);
const question = z
  .strictObject({
    key: z.string().regex(/^[a-z0-9]{1,8}$/),
    text: text(100),
    options: z.array(text(80)).min(1).max(6),
    recommended: text(80),
  })
  .refine((q) => q.options.includes(q.recommended));
export const itemSchema = z
  .strictObject({
    id,
    version: z.number().int().positive(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    class: z.enum(['decision', 'action', 'fyi', 'security']),
    risk: z.enum(['low', 'high']),
    title: text(100),
    body: text(280).optional(),
    questions: z.array(question).max(10).optional(),
    status: z.enum(['open', 'answered', 'withdrawn']),
    severity: severity.optional(),
  })
  .refine(
    (item) => new TextEncoder().encode(JSON.stringify(item)).byteLength <= 4096
  )
  .transform((item) => {
    if (item.class !== 'security' && !SECURITY.test(JSON.stringify(item)))
      return item;
    return {
      ...item,
      class: 'security' as const,
      title: 'Security issue',
      body: undefined,
      questions: undefined,
    };
  });
const environment = z
  .strictObject({
    product: id,
    environment: z.enum(['production', 'staging']),
    lastRelease: timestamp.nullable(),
    version: text(40),
    shortSha: z.string().regex(/^[a-f0-9]{7,12}$/),
    commitSubject: text(120),
    deployState: state,
    ciState: state,
  })
  .transform((row) => ({
    ...row,
    commitSubject: SECURITY.test(row.commitSubject)
      ? 'Security fix'
      : row.commitSubject,
  }));
const event = z
  .strictObject({
    seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    ts: timestamp,
    kind: z.enum([
      'shipped',
      'decided',
      'steer',
      'receipt',
      'incident',
      'needs_you',
      'lane',
      'eta',
    ]),
    product: id,
    severity,
    title: text(120),
    summary: text(280).optional(),
  })
  .transform((row) =>
    row.kind === 'incident' || SECURITY.test(JSON.stringify(row))
      ? { ...row, title: 'Security issue', summary: undefined }
      : row
  );
const snapshotBase = z
  .strictObject({
    enabled: z.boolean().optional(),
    pausedReason: text(100).optional(),
    needsYou: z.array(itemSchema).max(100),
    environments: z
      .array(environment)
      .max(40)
      .refine(
        (rows) =>
          new Set(rows.map((r) => `${r.product}:${r.environment}`)).size ===
          rows.length
      ),
    lanes: z
      .array(
        z.strictObject({
          id,
          title: text(100),
          state,
          eta: text(80).optional(),
        })
      )
      .max(100),
    backlog: z
      .array(z.strictObject({ id, title: text(100), owner: text(80), state }))
      .max(100),
  })
  .refine(
    (snapshot) =>
      new TextEncoder().encode(JSON.stringify(snapshot)).byteLength <=
      128 * 1024
  );
export const snapshotV3Schema = snapshotBase.safeExtend({
  org: orgSchema.optional(),
});
export const snapshotSchema = snapshotV3Schema;
const ingestV2Schema = z.strictObject({
  v: z.literal(2),
  seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sentAt: timestamp,
  decisions: z.array(decisionSchema).max(50).default([]),
  observability: observabilitySchema.optional(),
  snapshot: snapshotBase.optional(),
  events: z.array(event).max(100),
});
const ingestV3Schema = ingestV2Schema.extend({
  v: z.literal(3),
  snapshot: snapshotV3Schema.optional(),
});
export const ingestSchema = z.discriminatedUnion('v', [
  ingestV2Schema,
  ingestV3Schema,
]);
export type Ingest = z.infer<typeof ingestSchema>;
export type HubSnapshot = z.infer<typeof snapshotSchema>;
