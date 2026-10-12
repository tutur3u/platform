import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.uuid();
const number = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const label = z
  .string()
  .min(1)
  .max(512)
  .refine((s) => s.trim().length > 0);
export const scopeSchema = z
  .object({
    principalId: id,
    workspaceId: id,
    projectId: id,
    programId: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  })
  .strict();
export const identitySchema = z
  .object({ machineId: id, agentId: id, sourceStoreId: id, replicaId: id })
  .strict();
export const bindingSchema = z
  .object({
    scope: scopeSchema,
    identity: identitySchema,
    grantId: id,
    grantRevision: number,
  })
  .strict();
export const capabilities = [
  'outcomes:read',
  'planning:write',
  'ownership:claim',
] as const;
export const authoritySchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('denied') }).strict(),
  bindingSchema
    .extend({
      decision: z.literal('allowed'),
      expiresAt: number,
      capabilities: z
        .array(z.enum(capabilities))
        .max(3)
        .refine((v) => new Set(v).size === v.length),
    })
    .strict(),
]);
export type Authority = z.infer<typeof authoritySchema>;
export const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), title: label }).strict(),
  z
    .object({
      kind: z.literal('plan'),
      title: label,
      completion: z.enum(['open', 'user-confirmed']),
      fence: number,
    })
    .strict(),
  z.object({ kind: z.literal('tombstone'), fence: number }).strict(),
  z
    .object({
      kind: z.literal('acquire'),
      expectedFence: number,
      ttlMs: z.number().int().min(1000).max(60_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('renew'),
      fence: number,
      ttlMs: z.number().int().min(1000).max(60_000),
    })
    .strict(),
  z.object({ kind: z.literal('release'), fence: number }).strict(),
]);
export const proposalSchema = bindingSchema
  .extend({
    version: z.literal(1),
    operationId: id,
    outcomeId: id,
    expectedRevision: number,
    previousOutcomeHash: hash.nullable(),
    command: commandSchema,
  })
  .strict();
export type Proposal = z.infer<typeof proposalSchema>;
export const leaseSchema = z
  .object({ fence: number, expiresAt: number, binding: bindingSchema })
  .strict();
export const outcomeSchema = z
  .object({
    id,
    revision: number,
    title: label,
    completion: z.enum(['open', 'user-confirmed']),
    deleted: z.boolean(),
    lease: leaseSchema.nullable(),
    fence: number,
    lastHash: hash,
  })
  .strict();
export type Outcome = z.infer<typeof outcomeSchema>;
export const eventBodySchema = z
  .object({
    version: z.literal(1),
    serverStoreId: id,
    cursor: number,
    previousHash: hash.nullable(),
    proposal: proposalSchema,
    at: number,
    outcome: outcomeSchema.omit({ lastHash: true }),
  })
  .strict();
export const eventSchema = eventBodySchema.extend({ hash }).strict();
export type Event = z.infer<typeof eventSchema>;
export const receiptSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('accepted'), event: eventSchema }).strict(),
  z
    .object({
      kind: z.literal('conflict'),
      operationId: id,
      currentRevision: number,
      currentHash: hash.nullable(),
      proposed: proposalSchema,
    })
    .strict(),
]);
export type Receipt = z.infer<typeof receiptSchema>;
export const stateSchema = z
  .object({
    version: z.literal(1),
    serverStoreId: id,
    scope: scopeSchema,
    events: z.array(eventSchema).max(10_000),
    outcomes: z.array(outcomeSchema).max(1000),
    operations: z
      .array(
        z.object({ operationId: id, hash, receipt: receiptSchema }).strict()
      )
      .max(20_000),
  })
  .strict();
export type State = z.infer<typeof stateSchema>;
export const pageSchema = z
  .object({
    version: z.literal(1),
    serverStoreId: id,
    binding: bindingSchema,
    afterCursor: number,
    nextCursor: number,
    events: z.array(eventSchema).max(500),
  })
  .strict();
export type Page = z.infer<typeof pageSchema>;
export class SyncError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function fail(code: string): never {
  throw new SyncError(code);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) return fail('undefined_payload');
  return encoded;
}
export function digest(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function requireAuthority(
  input: unknown,
  binding: z.infer<typeof bindingSchema>,
  capability: (typeof capabilities)[number],
  now: number
) {
  if (!Number.isSafeInteger(now) || now < 0) fail('invalid_server_clock');
  const authority = authoritySchema.parse(input);
  if (
    authority.decision !== 'allowed' ||
    authority.expiresAt <= now ||
    !authority.capabilities.includes(capability)
  )
    fail('authority_unavailable');
  const {
    decision: _decision,
    expiresAt: _expires,
    capabilities: _capabilities,
    ...expected
  } = authority;
  if (canonical(expected) !== canonical(binding))
    fail('authority_binding_mismatch');
}
export function proposalBinding(proposal: Proposal) {
  return {
    scope: proposal.scope,
    identity: proposal.identity,
    grantId: proposal.grantId,
    grantRevision: proposal.grantRevision,
  };
}
export function verifyEvent(input: unknown) {
  const event = eventSchema.parse(input);
  const { hash: expected, ...body } = event;
  if (digest(body) !== expected) fail('event_hash_mismatch');
  if (
    event.outcome.id !== event.proposal.outcomeId ||
    event.outcome.revision !== event.proposal.expectedRevision + 1
  )
    fail('event_revision_mismatch');
  return event;
}
