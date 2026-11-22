import { z } from 'zod';
import { fleetLoginSchema } from './login';
import { fleetReviewSchema } from './review';
import { scrubFleetText } from './scrub';
import {
  fleetOwnerProofSchema,
  fleetPairAnswerSchema,
  fleetSealedSchema,
  fleetSecretActions,
  fleetSecretId,
  fleetSecretOutcomeSchema,
  fleetSecretSchema,
  SECRET_MAX_DECISIONS,
  SECRET_MAX_TTL_MS,
  secretPayloadMatches,
} from './secret-contract';

/**
 * Fleet sync v1: the sanitized live fleet snapshot the orchestrator Mac
 * publishes and the owner's phone reads. Framework-free so the publisher
 * script can import it. Every free-text field is scrubbed on parse, ids are
 * opaque slugs, and collections are capped so a runaway source cannot grow
 * the stored blob. See apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync.
 */
export const FLEET_SYNC_VERSION = 1;
export const FLEET_MAX_BODY_BYTES = 256 * 1024;

const text = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((value) => scrubFleetText(value, max));
const requiredText = (max: number) =>
  text(max).refine((value) => value.length > 0, 'empty');
/** Machine-derived labels fall back rather than fail the whole snapshot. */
const labelText = (max: number, fallback: string) =>
  text(max).transform((value) => value || fallback);
const slug = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const isoTime = z.iso.datetime({ offset: true });
const count = z.number().int().min(0).max(1_000_000);

export const fleetLaneStates = [
  'running',
  'waiting',
  'queued',
  'idle',
  'failed',
] as const;
export type FleetLaneState = (typeof fleetLaneStates)[number];

/**
 * How a lane that is no longer failing ended: a later run or same-work lane
 * recovered it (`quotaRecovered` when T3 resumed it after a usage limit), or
 * it was cancelled, interrupted or duplicated by a later attempt. Additive to
 * v1; such lanes are `idle`.
 */
export const fleetLaneResolutions = [
  'recovered',
  'quotaRecovered',
  'cancelled',
] as const;
export type FleetLaneResolution = (typeof fleetLaneResolutions)[number];

export const fleetLaneSchema = z.object({
  id: slug,
  title: labelText(80, 'Untitled lane'),
  project: text(40).optional(),
  provider: text(24).optional(),
  model: text(40).optional(),
  machineId: slug,
  state: z.enum(fleetLaneStates),
  resolution: z.enum(fleetLaneResolutions).optional(),
  parentId: slug.optional(),
  startedAt: isoTime.optional(),
  updatedAt: isoTime,
});

export const fleetMachineSchema = z.object({
  id: slug,
  label: labelText(40, 'Machine'),
  status: z.enum(['online', 'stale', 'offline']),
  lastSeenAt: isoTime.optional(),
  // A linked machine's lane listing: whole, capped, or not read this tick.
  laneCoverage: z.enum(['complete', 'partial', 'unavailable']).optional(),
  todayOutcomes: z
    .object({
      kind: z.enum(['complete', 'partial']),
      observedAt: isoTime,
      dayStart: isoTime,
      real: count,
      quotaRecovered: count,
      quotaUnrecovered: count,
      unclassified: count,
    })
    .optional(),
});

export const fleetDecisionOptionSchema = z.object({
  id: slug,
  label: requiredText(60),
});

export const fleetDecisionKinds = ['ask', 'login', 'review', 'secret'] as const;
export type FleetDecisionKind = (typeof fleetDecisionKinds)[number];

/**
 * Optional context fields (`why`, `defaultOutcome`, `requester`) and the
 * `login`, `review` and `secret` kinds are additive to v1: older clients
 * ignore them, and the owner read hides those items from clients that do not
 * declare the matching feature. A `secret` decision carries a machine-signed
 * request or pairing (see secret-contract.ts) and no options.
 */
export const fleetDecisionSchema = z
  .object({
    id: slug,
    kind: z.enum(fleetDecisionKinds).default('ask'),
    title: requiredText(120),
    body: text(600).optional(),
    /** Why the orchestrator is asking now. */
    why: text(240).optional(),
    /** What happens at the deadline without an answer. */
    defaultOutcome: text(160).optional(),
    /** Who is asking: an agent, lane or machine label. */
    requester: text(60).optional(),
    urgency: z.enum(['urgent', 'high', 'normal', 'fyi']),
    options: z.array(fleetDecisionOptionSchema).max(6).default([]),
    recommendedOptionId: slug.optional(),
    laneId: slug.optional(),
    login: fleetLoginSchema.optional(),
    review: fleetReviewSchema.optional(),
    secret: fleetSecretSchema.optional(),
    createdAt: isoTime,
    deadlineAt: isoTime.optional(),
  })
  .refine(
    (decision) =>
      !decision.recommendedOptionId ||
      decision.options.some(
        (option) => option.id === decision.recommendedOptionId
      ),
    { message: 'recommended option missing', path: ['recommendedOptionId'] }
  )
  .refine((decision) => (decision.kind === 'login') === !!decision.login, {
    message: 'login kind and login payload go together',
    path: ['login'],
  })
  .refine((decision) => (decision.kind === 'review') === !!decision.review, {
    message: 'review kind and review payload go together',
    path: ['review'],
  })
  .refine((decision) => (decision.kind === 'secret') === !!decision.secret, {
    message: 'secret kind and secret payload go together',
    path: ['secret'],
  })
  .refine(
    ({ id, secret, options, createdAt }) =>
      !secret ||
      (options.length === 0 &&
        fleetSecretId(secret) === id &&
        Date.parse(secret.expiresAt) - Date.parse(createdAt) <=
          SECRET_MAX_TTL_MS),
    {
      message: 'secret decisions sign their id, carry no options and expire',
      path: ['secret'],
    }
  );

export const fleetAnswerChannels = [
  'mastermind',
  'mobile',
  'whatsapp',
  'cli',
] as const;

/** A decision closed recently, kept so every surface shows where it went. */
export const fleetResolvedDecisionSchema = z
  .object({
    id: slug,
    kind: z.enum(fleetDecisionKinds).default('ask'),
    title: requiredText(120),
    answeredVia: z.enum(fleetAnswerChannels).optional(),
    /** Display label of the chosen option or outcome, never reply text. */
    outcome: text(60).optional(),
    /** The machine-signed outcome of a secret request or pairing. */
    secretOutcome: fleetSecretOutcomeSchema.optional(),
    resolvedAt: isoTime,
  })
  .refine((entry) => !entry.secretOutcome || entry.kind === 'secret', {
    message: 'secret outcome on a secret decision only',
    path: ['secretOutcome'],
  });

const shortSha = z.string().regex(/^[0-9a-f]{7,12}$/);

/** Release-train status: main freeze, production, migrations, incidents. */
export const fleetReleaseSchema = z.object({
  main: z.object({
    state: z.enum(['open', 'frozen']),
    reason: text(120).optional(),
    queued: count.optional(),
    headSha: shortSha.optional(),
  }),
  production: z
    .object({
      state: z.enum(['healthy', 'degraded', 'down', 'unknown']),
      sha: shortSha.optional(),
      deployedAt: isoTime.optional(),
    })
    .optional(),
  migrations: z
    .object({
      pending: count,
      state: z.enum(['idle', 'staging', 'gated', 'applying', 'failed']),
    })
    .optional(),
  incidents: z
    .array(
      z.object({
        id: slug,
        title: requiredText(120),
        severity: z.enum(['critical', 'high', 'medium', 'low']),
        openedAt: isoTime,
      })
    )
    .max(10)
    .default([]),
});

export const fleetStateSchema = z.object({
  version: z.literal(FLEET_SYNC_VERSION),
  generatedAt: isoTime,
  orchestrator: z.object({
    label: requiredText(24),
    state: z.enum(['running', 'waiting', 'idle', 'offline']),
    lastActiveAt: isoTime.optional(),
  }),
  /**
   * `failed` counts only terminal failures nobody picked up again. The
   * optional resolution counts are additive and also included in `idle`.
   */
  counts: z.object({
    running: count,
    waiting: count,
    queued: count,
    idle: count,
    failed: count,
    recovered: count.optional(),
    quotaRecovered: count.optional(),
    cancelled: count.optional(),
  }),
  machines: z.array(fleetMachineSchema).max(32),
  lanes: z.array(fleetLaneSchema).max(300),
  /** Up to 50 asks plus up to 10 login and 10 secret requests on top. */
  decisions: z
    .array(fleetDecisionSchema)
    .max(70)
    .refine(
      (decisions) =>
        decisions.filter((d) => d.kind !== 'login' && d.kind !== 'secret')
          .length <= 50 &&
        decisions.filter((d) => d.kind === 'login').length <= 10 &&
        decisions.filter((d) => d.kind === 'secret').length <=
          SECRET_MAX_DECISIONS,
      { message: 'at most 50 asks, 10 login and 10 secret requests' }
    ),
  resolved: z.array(fleetResolvedDecisionSchema).max(20).optional(),
  release: fleetReleaseSchema.optional(),
});

export type FleetLane = z.infer<typeof fleetLaneSchema>;
export type FleetMachine = z.infer<typeof fleetMachineSchema>;
export type FleetDecision = z.infer<typeof fleetDecisionSchema>;
export type FleetResolvedDecision = z.infer<typeof fleetResolvedDecisionSchema>;
export type FleetRelease = z.infer<typeof fleetReleaseSchema>;
export type FleetState = z.infer<typeof fleetStateSchema>;

/**
 * `signed_in` is the owner's "I signed in" on a login request; the agent
 * still verifies the sign-in itself before the request reads as verified.
 * `request_changes` answers a design review and carries the owner's notes.
 * These are the actions every client renders. The secret actions (`secret`,
 * `decline`, `pair`; see secret-contract.ts) answer `secret` decisions only,
 * which reach only clients declaring the `secret` feature.
 */
export const fleetAnswerActions = [
  'approve',
  'hold',
  'reply',
  'signed_in',
  'request_changes',
] as const;
/** Every action Web accepts and stores. */
export const fleetAnswerInputActions = [
  ...fleetAnswerActions,
  ...fleetSecretActions,
] as const;
export type FleetAnswerAction = (typeof fleetAnswerInputActions)[number];

export const fleetAnswerInputSchema = z
  .object({
    action: z.enum(fleetAnswerInputActions),
    optionId: slug.optional(),
    text: z.string().trim().max(2000).optional(),
    sealed: fleetSealedSchema.optional(),
    owner: fleetOwnerProofSchema.optional(),
    pair: fleetPairAnswerSchema.optional(),
    /** Body fallback for clients that cannot set the Idempotency-Key header. */
    idempotencyKey: z.string().optional(),
  })
  .refine(
    (input) =>
      (input.action !== 'reply' && input.action !== 'request_changes') ||
      !!input.text,
    { message: 'reply needs text', path: ['text'] }
  )
  .refine(secretPayloadMatches, {
    message: 'secret payload fields belong to their action',
    path: ['action'],
  });
export type FleetAnswerInput = z.infer<typeof fleetAnswerInputSchema>;

/**
 * One owner answer as stored; the orchestrator receives every field except
 * `actorId`.
 */
export interface FleetAnswerRecord {
  decisionId: string;
  revision: number;
  action: FleetAnswerAction;
  optionId?: string;
  text?: string;
  idempotencyKey: string;
  /**
   * Who answered, kept only to replay this record's receipt to the same
   * actor; never sent to the orchestrator or another reader.
   */
  actorId?: string;
  answeredAt: string;
  /** Secret answers, as received; dropped once the orchestrator acknowledges. */
  sealed?: FleetAnswerInput['sealed'];
  owner?: FleetAnswerInput['owner'];
  pair?: FleetAnswerInput['pair'];
  /** SHA-256 hex of a secret answer's payload, kept so retries still replay. */
  payloadDigest?: string;
  /** When a secret answer record expires (`expiresAt` plus 10 minutes). */
  keepUntil?: string;
  /** Earlier pairing answers kept beside the latest, oldest first. */
  earlier?: Omit<
    FleetAnswerRecord,
    'earlier' | 'pickedUpRevision' | 'pickedUpAt'
  >[];
  /** Revision the orchestrator acknowledged; equal to `revision` once picked up. */
  pickedUpRevision: number;
  pickedUpAt?: string;
}

export const fleetAckSchema = z.object({
  acks: z
    .array(z.object({ decisionId: slug, revision: z.number().int().min(1) }))
    .max(100),
});
