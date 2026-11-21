import { z } from 'zod';
import {
  createInternalApiClient,
  type InternalApiClientOptions,
} from './client';

/** The tiers the Owner can grant. The Owner tier itself is never granted. */
export const fleetGrantTiers = ['observer', 'steerer', 'operator'] as const;
export type FleetGrantTier = (typeof fleetGrantTiers)[number];

const observerCapabilities = ['status.read', 'ask', 'intent.request'] as const;
const steererCapabilities = [
  ...observerCapabilities,
  'work.create',
  'work.redirect',
  'priority.set',
  'comment',
  'approve.low',
] as const;
const operatorCapabilities = [
  ...steererCapabilities,
  'approve.deploy',
  'approve.production_change',
  'lane.pause',
] as const;

export type FleetGrantCapability = (typeof operatorCapabilities)[number];

/** Mirrors the database tier ceiling, which still rejects anything above it. */
export const fleetTierCeiling: Record<
  FleetGrantTier,
  readonly FleetGrantCapability[]
> = {
  observer: observerCapabilities,
  steerer: steererCapabilities,
  operator: operatorCapabilities,
};

export const fleetDisplayFields = [
  'lane',
  'releaseTitle',
  'readinessItem',
] as const;
export type FleetDisplayField = (typeof fleetDisplayFields)[number];

const projectKey = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
/** Generations are bigints, carried as decimal strings. */
const generation = z.string().regex(/^[1-9][0-9]{0,18}$/);
const instant = z.iso
  .datetime({ precision: 3 })
  .refine((value) => !value.startsWith('0000'));
const plainText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        value === value.trim() &&
        [...value].every((char) => char >= ' ' && char !== '\u007f')
    );
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const capability = z.enum(operatorCapabilities);
const displayValue = plainText(120);

export const fleetOwnerGrantSchema = z.strictObject({
  userId: z.uuid(),
  email: z.string().nullable(),
  tier: z.enum(fleetGrantTiers),
  capabilities: z.array(capability),
  projects: z.array(projectKey),
  expiresAt: instant.nullable(),
  revokedAt: instant.nullable(),
  status: z.enum(['active', 'expired', 'revoked']),
  generation,
  questionsPerHour: z.number().int().nonnegative(),
  intentsPerDay: z.number().int().nonnegative(),
  modelBudgetPerMonth: z.number().int().nonnegative(),
});

export const fleetOwnerProjectSchema = z.strictObject({
  key: projectKey,
  nameEn: z.string().min(1),
  nameVi: z.string().min(1),
  displayValues: z.strictObject({
    lane: z.array(z.string()),
    releaseTitle: z.array(z.string()),
    readinessItem: z.array(z.string()),
  }),
});

export const fleetOwnerConsoleSchema = z.strictObject({
  stopped: z.boolean(),
  generation,
  grants: z.array(fleetOwnerGrantSchema),
  projects: z.array(fleetOwnerProjectSchema),
});

export type FleetOwnerGrant = z.infer<typeof fleetOwnerGrantSchema>;
export type FleetOwnerProject = z.infer<typeof fleetOwnerProjectSchema>;
export type FleetOwnerConsole = z.infer<typeof fleetOwnerConsoleSchema>;

export const fleetGrantInputSchema = z
  .strictObject({
    email: z.email().max(320),
    tier: z.enum(fleetGrantTiers),
    capabilities: z.array(capability).min(1).max(11).refine(unique),
    projectKeys: z.array(projectKey).min(1).max(50).refine(unique),
    expiresAt: instant.nullable(),
    questionsPerHour: z.number().int().min(0).max(1000),
    intentsPerDay: z.number().int().min(0).max(1000),
    modelBudgetPerMonth: z.number().int().min(0).max(1_000_000_000),
    /** Null files a new grant; an edit passes the generation it read. */
    expectedGeneration: generation.nullable(),
  })
  .refine(
    ({ tier, capabilities }) =>
      capabilities.every((value) => fleetTierCeiling[tier].includes(value)),
    { path: ['capabilities'], message: 'Above the tier ceiling' }
  );

export const fleetRevokeInputSchema = z.strictObject({
  userId: z.uuid(),
  expectedGeneration: generation,
});

export const fleetControlInputSchema = z.strictObject({
  stopped: z.boolean(),
  expectedGeneration: generation,
});

export const fleetProjectInputSchema = z.strictObject({
  key: projectKey,
  nameEn: plainText(80),
  nameVi: plainText(80),
});

export const fleetDisplayValueInputSchema = z.strictObject({
  projectKey,
  field: z.enum(fleetDisplayFields),
  value: displayValue,
  approved: z.boolean(),
});

export type FleetGrantInput = z.infer<typeof fleetGrantInputSchema>;
export type FleetRevokeInput = z.infer<typeof fleetRevokeInputSchema>;
export type FleetControlInput = z.infer<typeof fleetControlInputSchema>;
export type FleetProjectInput = z.infer<typeof fleetProjectInputSchema>;
export type FleetDisplayValueInput = z.infer<
  typeof fleetDisplayValueInputSchema
>;

export const fleetGrantResultSchema = z.strictObject({
  result: z.enum(['granted', 'updated']),
  userId: z.uuid(),
  generation,
});
export const fleetRevokeResultSchema = z.strictObject({
  result: z.literal('revoked'),
  generation,
});
export const fleetControlResultSchema = z.strictObject({
  result: z.enum(['stopped', 'resumed', 'unchanged']),
  stopped: z.boolean(),
  generation,
});
export const fleetProjectResultSchema = z.strictObject({
  result: z.enum(['created', 'updated']),
});
export const fleetDisplayValueResultSchema = z.strictObject({
  result: z.enum(['approved', 'removed', 'unchanged']),
});

/** Refusal codes the owner routes return as `{ error }`. */
export const fleetOwnerRefusals = [
  'unknown_user',
  'unknown_project',
  'not_found',
  'invalid_grant',
  'invalid_project',
  'invalid_value',
  'grant_exists',
  'generation_changed',
  'already_revoked',
  'too_many_values',
  'mfa_required',
  'owner_session_required',
  'forbidden',
  'rate_limited',
] as const;
export type FleetOwnerRefusal = (typeof fleetOwnerRefusals)[number];

const ownerPath = '/api/v1/fleet/owner';

function postOwner<T>(
  path: string,
  body: unknown,
  options?: InternalApiClientOptions
) {
  return createInternalApiClient(options).json<T>(`${ownerPath}/${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function getFleetOwnerConsole(options?: InternalApiClientOptions) {
  return createInternalApiClient(options).json<FleetOwnerConsole>(
    `${ownerPath}/access`,
    { cache: 'no-store' }
  );
}

export function grantFleetAccess(
  input: FleetGrantInput,
  options?: InternalApiClientOptions
) {
  return postOwner<z.infer<typeof fleetGrantResultSchema>>(
    'grants',
    input,
    options
  );
}

export function revokeFleetAccess(
  input: FleetRevokeInput,
  options?: InternalApiClientOptions
) {
  return postOwner<z.infer<typeof fleetRevokeResultSchema>>(
    'grants/revoke',
    input,
    options
  );
}

export function setFleetStopped(
  input: FleetControlInput,
  options?: InternalApiClientOptions
) {
  return postOwner<z.infer<typeof fleetControlResultSchema>>(
    'control',
    input,
    options
  );
}

export function upsertFleetProject(
  input: FleetProjectInput,
  options?: InternalApiClientOptions
) {
  return postOwner<z.infer<typeof fleetProjectResultSchema>>(
    'projects',
    input,
    options
  );
}

export function setFleetDisplayValue(
  input: FleetDisplayValueInput,
  options?: InternalApiClientOptions
) {
  return postOwner<z.infer<typeof fleetDisplayValueResultSchema>>(
    'display-values',
    input,
    options
  );
}
