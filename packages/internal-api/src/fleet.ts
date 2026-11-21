import { z } from 'zod';
import {
  createInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import type {
  FleetIntentInput,
  FleetIntentPage,
  FleetLinkCode,
  FleetLinkConfirmation,
  FleetLinkConfirmationInput,
} from './fleet-intents';

export const fleetDigestStates = [
  'planned',
  'running',
  'blocked',
  'ready',
  'done',
  'paused',
] as const;

const projectKey = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const displayValue = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value === value.trim());
const instant = z.iso
  .datetime({ precision: 3 })
  .refine((value) => !value.startsWith('0000'));

const digestLane = z.strictObject({
  lane: displayValue,
  state: z.enum(fleetDigestStates),
  eta: instant.optional(),
  shortSha: z
    .string()
    .regex(/^[0-9a-f]{7,12}$/)
    .optional(),
  releaseTitle: displayValue.optional(),
  readinessItem: displayValue.optional(),
  blockerCodes: z
    .array(
      z.enum([
        'dependency',
        'review',
        'ci',
        'approval',
        'release_hold',
        'capacity',
        'incident',
      ])
    )
    .max(7)
    .refine((codes) => new Set(codes).size === codes.length),
});

export const fleetDigestSectionSchema = z.strictObject({
  projectKey,
  generatedAt: instant,
  lanes: z
    .array(digestLane)
    .max(100)
    .refine(
      (lanes) => new Set(lanes.map(({ lane }) => lane)).size === lanes.length
    ),
});

export const fleetStoredDigestSectionSchema = fleetDigestSectionSchema.extend({
  receivedAt: instant,
  stale: z.boolean(),
});

const fleetCapability = z.enum([
  'status.read',
  'ask',
  'intent.request',
  'work.create',
  'work.redirect',
  'priority.set',
  'comment',
  'approve.low',
  'approve.deploy',
  'approve.production_change',
  'lane.pause',
  'approve.migration',
  'approve.billing',
  'access.grant',
  'access.revoke',
  'fleet.stop',
  'fleet.resume',
]);

export const fleetAccessSchema = z.discriminatedUnion('enabled', [
  z.strictObject({
    enabled: z.literal(false),
    tier: z.null(),
    projects: z.tuple([]),
    capabilities: z.tuple([]),
    stopped: z.boolean(),
  }),
  z.strictObject({
    enabled: z.literal(true),
    tier: z.enum(['observer', 'steerer', 'operator', 'owner']),
    projects: z.array(projectKey),
    capabilities: z.array(fleetCapability),
    stopped: z.literal(false),
  }),
]);

export type FleetAccess = z.infer<typeof fleetAccessSchema>;
export type FleetDigestSnapshot = z.infer<typeof fleetDigestSectionSchema>;
export type FleetDigestSection = z.infer<typeof fleetStoredDigestSectionSchema>;

export type FleetDigest = {
  sections: FleetDigestSection[];
  totals: {
    projects: number;
    lanes: number;
    byState: Record<(typeof fleetDigestStates)[number], number>;
  };
};

export function summarizeFleetDigest(
  sections: FleetDigestSection[]
): FleetDigest {
  const totals = {
    projects: sections.length,
    lanes: 0,
    byState: {
      planned: 0,
      running: 0,
      blocked: 0,
      ready: 0,
      done: 0,
      paused: 0,
    },
  };
  for (const { lanes } of sections) {
    totals.lanes += lanes.length;
    for (const { state } of lanes) totals.byState[state]++;
  }
  return { sections, totals };
}

export function getFleetAccess(options?: InternalApiClientOptions) {
  return createInternalApiClient(options).json<FleetAccess>(
    '/api/v1/fleet/access',
    { cache: 'no-store' }
  );
}

export function getFleetDigest(options?: InternalApiClientOptions) {
  return createInternalApiClient(options).json<FleetDigest>(
    '/api/v1/fleet/digest',
    { cache: 'no-store' }
  );
}

export function publishFleetDigest(
  section: FleetDigestSnapshot,
  options: InternalApiClientOptions
) {
  return createInternalApiClient(options).json<void>('/api/v1/fleet/digest', {
    method: 'PUT',
    cache: 'no-store',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(section),
  });
}

export function listFleetIntents(
  before?: string,
  options?: InternalApiClientOptions
) {
  return createInternalApiClient(options).json<FleetIntentPage>(
    '/api/v1/fleet/intents',
    { cache: 'no-store', query: { before } }
  );
}

function postFleet<T>(
  path: string,
  body: unknown,
  options?: InternalApiClientOptions
) {
  return createInternalApiClient(options).json<T>(path, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function submitFleetIntent(
  input: FleetIntentInput,
  options?: InternalApiClientOptions
) {
  return postFleet<{ id: string }>('/api/v1/fleet/intents', input, options);
}

export function createFleetLinkCode(options?: InternalApiClientOptions) {
  return postFleet<FleetLinkCode>(
    '/api/v1/fleet/identity/link-codes',
    {},
    options
  );
}

/** Previews the pending link with `preview: true`; confirms it otherwise. */
export function confirmFleetLink(
  input: FleetLinkConfirmationInput,
  options?: InternalApiClientOptions
) {
  return postFleet<FleetLinkConfirmation>(
    '/api/v1/fleet/identity/confirm',
    input,
    options
  );
}

export {
  type FleetIntentInput,
  type FleetIntentPage,
  type FleetIntentReceipt,
  type FleetLinkCode,
  type FleetLinkConfirmation,
  type FleetLinkConfirmationInput,
  fleetIntentInputSchema,
  fleetIntentPageSchema,
  fleetIntentReceiptSchema,
  fleetLinkCodeSchema,
  fleetLinkConfirmationInputSchema,
  fleetLinkConfirmationSchema,
} from './fleet-intents';
