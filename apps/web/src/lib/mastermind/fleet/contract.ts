import { z } from 'zod';
import { fleetLoginSchema } from './login';
import { scrubFleetText } from './scrub';

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

export const fleetLaneSchema = z.object({
  id: slug,
  title: labelText(80, 'Untitled lane'),
  project: text(40).optional(),
  provider: text(24).optional(),
  model: text(40).optional(),
  machineId: slug,
  state: z.enum(fleetLaneStates),
  parentId: slug.optional(),
  startedAt: isoTime.optional(),
  updatedAt: isoTime,
});

export const fleetMachineSchema = z.object({
  id: slug,
  label: labelText(40, 'Machine'),
  status: z.enum(['online', 'stale', 'offline']),
  lastSeenAt: isoTime.optional(),
});

export const fleetDecisionOptionSchema = z.object({
  id: slug,
  label: requiredText(60),
});

export const fleetDecisionKinds = ['ask', 'login'] as const;
export type FleetDecisionKind = (typeof fleetDecisionKinds)[number];

/**
 * Optional context fields (`why`, `defaultOutcome`, `requester`) and the
 * `login` kind are additive to v1: older clients ignore them and read a
 * login request as an ask with its title and body.
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
  });

export const fleetAnswerChannels = [
  'mastermind',
  'mobile',
  'whatsapp',
  'cli',
] as const;

/** A decision closed recently, kept so every surface shows where it went. */
export const fleetResolvedDecisionSchema = z.object({
  id: slug,
  kind: z.enum(fleetDecisionKinds).default('ask'),
  title: requiredText(120),
  answeredVia: z.enum(fleetAnswerChannels).optional(),
  /** Display label of the chosen option or outcome, never reply text. */
  outcome: text(60).optional(),
  resolvedAt: isoTime,
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
  counts: z.object({
    running: count,
    waiting: count,
    queued: count,
    idle: count,
    failed: count,
  }),
  machines: z.array(fleetMachineSchema).max(32),
  lanes: z.array(fleetLaneSchema).max(300),
  /** Up to 50 asks plus up to 10 login requests on top. */
  decisions: z
    .array(fleetDecisionSchema)
    .max(60)
    .refine(
      (decisions) =>
        decisions.filter((d) => d.kind !== 'login').length <= 50 &&
        decisions.filter((d) => d.kind === 'login').length <= 10,
      { message: 'at most 50 asks and 10 login requests' }
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
 */
export const fleetAnswerActions = [
  'approve',
  'hold',
  'reply',
  'signed_in',
] as const;
export type FleetAnswerAction = (typeof fleetAnswerActions)[number];

export const fleetAnswerInputSchema = z
  .object({
    action: z.enum(fleetAnswerActions),
    optionId: slug.optional(),
    text: z.string().trim().max(2000).optional(),
    /** Body fallback for clients that cannot set the Idempotency-Key header. */
    idempotencyKey: z.string().optional(),
  })
  .refine((input) => input.action !== 'reply' || !!input.text, {
    message: 'reply needs text',
    path: ['text'],
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
  /** Revision the orchestrator acknowledged; equal to `revision` once picked up. */
  pickedUpRevision: number;
  pickedUpAt?: string;
}

export const fleetAckSchema = z.object({
  acks: z
    .array(z.object({ decisionId: slug, revision: z.number().int().min(1) }))
    .max(100),
});
