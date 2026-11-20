import { z } from 'zod';
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

export const fleetDecisionSchema = z
  .object({
    id: slug,
    title: requiredText(120),
    body: text(600).optional(),
    urgency: z.enum(['urgent', 'high', 'normal', 'fyi']),
    options: z.array(fleetDecisionOptionSchema).max(6).default([]),
    recommendedOptionId: slug.optional(),
    laneId: slug.optional(),
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
  );

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
  decisions: z.array(fleetDecisionSchema).max(50),
});

export type FleetLane = z.infer<typeof fleetLaneSchema>;
export type FleetMachine = z.infer<typeof fleetMachineSchema>;
export type FleetDecision = z.infer<typeof fleetDecisionSchema>;
export type FleetState = z.infer<typeof fleetStateSchema>;

export const fleetAnswerActions = ['approve', 'hold', 'reply'] as const;
export type FleetAnswerAction = (typeof fleetAnswerActions)[number];

export const fleetAnswerInputSchema = z
  .object({
    action: z.enum(fleetAnswerActions),
    optionId: slug.optional(),
    text: z.string().trim().max(2000).optional(),
  })
  .refine((input) => input.action !== 'reply' || !!input.text, {
    message: 'reply needs text',
    path: ['text'],
  });
export type FleetAnswerInput = z.infer<typeof fleetAnswerInputSchema>;

/** One owner answer, as stored and as the orchestrator receives it. */
export interface FleetAnswerRecord {
  decisionId: string;
  revision: number;
  action: FleetAnswerAction;
  optionId?: string;
  text?: string;
  idempotencyKey: string;
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
