import { z } from 'zod';

export const uuid = z.uuid().refine((value) => value === value.toLowerCase());
export const key = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/);
export const principal = z.union([
  z.templateLiteral(['agent:', key]),
  z.templateLiteral(['user:', uuid]),
]);
export const ms = z.int().nonnegative();
export const text = (size: number) => z.string().trim().min(1).max(size);
export const ref = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
export const messages = z.discriminatedUnion('schema', [
  z.strictObject({
    schema: z.literal('security_finding'),
    schemaVersion: z.literal(1),
    body: z
      .strictObject({
        findingId: key,
        severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
        status: z.enum(['open', 'fixed', 'false_positive', 'accepted']),
        title: text(160),
        summary: text(1500),
        evidenceRef: ref.optional(),
        dispositionRef: ref.optional(),
      })
      .refine(
        (body) =>
          !['accepted', 'false_positive'].includes(body.status) ||
          !!body.dispositionRef
      ),
  }),
  z.strictObject({
    schema: z.literal('receipt'),
    schemaVersion: z.literal(1),
    body: z.strictObject({
      operation: text(120),
      result: z.enum(['pass', 'fail', 'skipped', 'blocked']),
      subjectRef: ref,
      sourceSha: z
        .string()
        .regex(/^[0-9a-f]{40}$/)
        .optional(),
      evidenceRef: ref.optional(),
      observedAt: ms,
      summary: text(1000).optional(),
    }),
  }),
  z.strictObject({
    schema: z.literal('eta_row'),
    schemaVersion: z.literal(1),
    body: z
      .strictObject({
        ownerKey: key,
        latestBy: ms,
        verification: text(500),
        status: z.enum(['pending', 'met', 'missed', 'cancelled']),
        evidenceRef: ref.optional(),
      })
      .refine((body) => body.status !== 'met' || !!body.evidenceRef),
  }),
  z.strictObject({
    schema: z.literal('decision'),
    schemaVersion: z.literal(1),
    body: z.strictObject({
      decisionId: key,
      status: z.enum(['proposed', 'accepted', 'rejected', 'superseded']),
      title: text(160),
      rationale: text(1500),
      supersedes: uuid.optional(),
    }),
  }),
  z.strictObject({
    schema: z.literal('handoff'),
    schemaVersion: z.literal(1),
    body: z.strictObject({
      fromKey: key,
      toKey: key,
      summary: text(1500),
      nextAction: text(600),
      evidenceRefs: z
        .array(ref)
        .max(8)
        .refine((refs) => new Set(refs).size === refs.length),
    }),
  }),
  z.strictObject({
    schema: z.literal('note'),
    schemaVersion: z.literal(1),
    body: z.strictObject({ text: text(2000) }),
  }),
]);
