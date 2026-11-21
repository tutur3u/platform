import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import {
  type FleetControlInput,
  type FleetDisplayValueInput,
  type FleetGrantInput,
  type FleetOwnerConsole,
  type FleetOwnerRefusal,
  type FleetProjectInput,
  type FleetRevokeInput,
  fleetControlResultSchema,
  fleetDisplayValueResultSchema,
  fleetGrantResultSchema,
  fleetOwnerConsoleSchema,
  fleetOwnerRefusals,
  fleetProjectResultSchema,
  fleetRevokeResultSchema,
  getFleetOwnerConsole,
  grantFleetAccess,
  revokeFleetAccess,
  setFleetDisplayValue,
  setFleetStopped,
  upsertFleetProject,
} from '@tuturuuu/internal-api/fleet';
import type { z } from 'zod';

export type OwnerRefusal = FleetOwnerRefusal | 'invalid' | 'unavailable';

/** `mfa_required` asks for a fresh sign-in; `forbidden` is not the Owner. */
export type OwnerRead =
  | { kind: 'ok'; data: FleetOwnerConsole }
  | { kind: 'denied'; reason: 'mfa_required' | 'forbidden' };
export type OwnerWrite<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'refused'; reason: OwnerRefusal };

function statusOf(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : 0;
}

export function ownerRefusalOf(error: unknown): OwnerRefusal {
  const message = error instanceof Error ? error.message : '';
  const known = fleetOwnerRefusals.find((code) => code === message);
  if (known) return known;
  const status = statusOf(error);
  if (status === 400 || status === 413 || status === 415) return 'invalid';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 409) return 'generation_changed';
  if (status === 429) return 'rate_limited';
  return 'unavailable';
}

/** Denials become a typed state; transport and contract failures throw. */
export async function readOwnerConsole(
  options: InternalApiClientOptions
): Promise<OwnerRead> {
  try {
    return {
      kind: 'ok',
      data: fleetOwnerConsoleSchema.parse(await getFleetOwnerConsole(options)),
    };
  } catch (error) {
    const reason = ownerRefusalOf(error);
    if (reason === 'mfa_required') return { kind: 'denied', reason };
    if (reason === 'forbidden' || reason === 'owner_session_required') {
      return { kind: 'denied', reason: 'forbidden' };
    }
    throw new Error('Fleet Owner read unavailable');
  }
}

async function write<T>(
  pending: Promise<unknown>,
  schema: z.ZodType<T>
): Promise<OwnerWrite<T>> {
  let value: unknown;
  try {
    value = await pending;
  } catch (error) {
    return { kind: 'refused', reason: ownerRefusalOf(error) };
  }
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { kind: 'ok', data: parsed.data }
    : { kind: 'refused', reason: 'unavailable' };
}

export const sendGrant = (
  input: FleetGrantInput,
  options: InternalApiClientOptions
) => write(grantFleetAccess(input, options), fleetGrantResultSchema);

export const sendRevoke = (
  input: FleetRevokeInput,
  options: InternalApiClientOptions
) => write(revokeFleetAccess(input, options), fleetRevokeResultSchema);

export const sendControl = (
  input: FleetControlInput,
  options: InternalApiClientOptions
) => write(setFleetStopped(input, options), fleetControlResultSchema);

export const sendProject = (
  input: FleetProjectInput,
  options: InternalApiClientOptions
) => write(upsertFleetProject(input, options), fleetProjectResultSchema);

export const sendDisplayValue = (
  input: FleetDisplayValueInput,
  options: InternalApiClientOptions
) =>
  write(setFleetDisplayValue(input, options), fleetDisplayValueResultSchema);
