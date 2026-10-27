import { z } from 'zod';

export const SECURITY =
  /sec-\d|vuln|idor|cve|rls|leak|breach|exploit|pii|auth(?:entication)? bypass|incident|security/i;
const UNSAFE =
  /gh[pousr]_|github_pat_|\bsk-|\bxox|\bAKIA|\beyJ[A-Za-z0-9_-]+\.|-----BEGIN|\bBearer\b|https?:\/\/\S*(?:\?|\/hooks\/)|relay\.t3\.codes|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\s().-]*){9,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\bdpl_\w+|\b(?:\d{1,3}\.){3}\d{1,3}\b|(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]+|~\/|\/(?:Users|home)\//i;
function safe(value: string) {
  return SECURITY.test(value)
    ? 'Security issue'
    : UNSAFE.test(value)
      ? 'Withheld, open on Mac'
      : value;
}
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) =>
      [...value].every((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
    )
    .transform(safe);
const id = z
  .string()
  .max(80)
  .regex(/^[a-z][a-z0-9-]*$/)
  .refine((value) => !UNSAFE.test(value));
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
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
export const snapshotSchema = z.strictObject({
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
      z.strictObject({ id, title: text(100), state, eta: text(80).optional() })
    )
    .max(100),
  backlog: z
    .array(z.strictObject({ id, title: text(100), owner: text(80), state }))
    .max(100),
});
export const ingestSchema = z.strictObject({
  v: z.literal(1),
  seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sentAt: timestamp,
  snapshot: snapshotSchema.optional(),
  events: z.array(event).max(100),
});
export type Ingest = z.infer<typeof ingestSchema>;
export type HubSnapshot = z.infer<typeof snapshotSchema>;
