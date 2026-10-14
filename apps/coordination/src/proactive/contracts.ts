import { z } from 'zod';

export const contextKindSchema = z.enum([
  'journal',
  'memory',
  'goals',
  'task',
  'calendar',
  'notifications',
]);
const referenceFields = {
  actorId: z.uuid(),
  personalWorkspaceId: z.uuid(),
  sourceId: z.uuid(),
  observedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  deletionVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  revocationVersion: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER),
  consentVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
};
export const journalEvidenceSchema = z
  .object({
    ...referenceFields,
    kind: z.literal('journal'),
    sourceRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const evidenceSchema = z
  .discriminatedUnion('kind', [
    journalEvidenceSchema,
    z
      .object({
        ...referenceFields,
        kind: z.enum(['memory', 'goals', 'task', 'calendar', 'notifications']),
        sourceRevision: z.string().min(1).max(100),
      })
      .strict(),
  ])
  .refine(
    (value) => Date.parse(value.expiresAt) > Date.parse(value.observedAt),
    'expiry must follow observation'
  );
export type ContextEvidence = z.infer<typeof evidenceSchema>;
export const contextSchema = z
  .object({
    qualified: z.boolean(),
    allowedSources: z.array(contextKindSchema).max(6),
    permissionVersion: z.string().min(1).max(100),
    canResearch: z.boolean(),
    canPlan: z.boolean(),
    canDryRun: z.boolean(),
    evidence: z.array(evidenceSchema).max(8),
  })
  .strict();
export type WorkContext = z.infer<typeof contextSchema>;

export type Identity = {
  actorId: string;
  workspaceId: string;
};

export type DueJob = Identity & {
  occurrenceId: string;
  dueAt: number;
  expiresAt: number;
  sourceVersion: string;
  consentVersion: string;
  action: 'reflection-dry-run';
};

const consentSchema = z
  .object({
    actorId: z.string().min(1).max(100),
    workspaceId: z.string().min(1).max(100),
    creatorId: z.string().min(1).max(100),
    personal: z.boolean(),
    enabled: z.boolean(),
    paused: z.boolean(),
    version: z.string().min(1).max(100),
    sourceVersion: z.string().min(1).max(100),
    timezone: z.string().min(1).max(100),
    cadenceMs: z.number().int(),
    previousDueAt: z.number().int().nullable(),
    quietHours: z
      .object({ startMinute: z.number().int(), endMinute: z.number().int() })
      .strict()
      .nullable(),
    maxRuns: z.number().int(),
    remainingUnits: z.number().int(),
  })
  .strict();
export type Consent = z.infer<typeof consentSchema>;
export const authoritySnapshotSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('denied'), reason: z.string().min(1).max(100) })
    .strict(),
  z
    .object({
      kind: z.literal('qualified'),
      checkedAt: z.number().int(),
      validUntil: z.number().int(),
      paid: z.boolean(),
      consent: consentSchema,
      context: contextSchema,
    })
    .strict(),
]);
export type AuthoritySnapshot = z.infer<typeof authoritySnapshotSchema>;

export type DryRunResult = {
  kind: 'reflection-dry-run';
  occurrenceId: string;
  sourceVersion: string;
  visibility: 'private';
  sourceRead: false;
  providerCalled: false;
};

export type Phase =
  | { kind: 'pending' }
  | { kind: 'leased'; token: string; until: number }
  | { kind: 'completed'; result: DryRunResult }
  | { kind: 'cancelled'; reason: string }
  | { kind: 'unknown'; acceptance: 'unknown' | 'accepted' }
  | { kind: 'dead-letter'; reason: string };

export type JobState = { job: DueJob; runs: number; phase: Phase };

export interface JobStore {
  read(): JobState | null;
  write(state: JobState): void;
  transaction<T>(operation: () => T): T;
}

export interface Authority {
  read(identity: Identity, now: number): Promise<unknown>;
}

export type Outcome =
  | { kind: 'denied'; reason: string }
  | { kind: 'waiting'; at: number }
  | { kind: 'state'; state: JobState };

export const MAX_RUNS = 3;
export const LEASE_MS = 30_000;
export const MIN_CADENCE_MS = 86_400_000;
export const MAX_LIFETIME_MS = 7 * 86_400_000;
