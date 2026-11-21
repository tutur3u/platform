import { createServerFn } from '@tanstack/react-start';
import {
  fleetControlInputSchema,
  fleetDisplayValueInputSchema,
  fleetGrantInputSchema,
  fleetProjectInputSchema,
  fleetRevokeInputSchema,
} from '@tuturuuu/internal-api/fleet';
import { currentOwner } from '../native/context';
import { fleetApiOptions } from './upstream';
import {
  readOwnerConsole,
  sendControl,
  sendDisplayValue,
  sendGrant,
  sendProject,
  sendRevoke,
} from './owner-upstream';

/**
 * Owner-only server functions. They keep the compiler's hashed IDs, so the
 * Worker never admits them on a grantee's Fleet path, and they read the owner
 * identity, which a grantee request never sets. Web still requires the
 * configured Owner and a fresh MFA proof on every call.
 */
const options = () => fleetApiOptions(currentOwner().token);

export const fleetOwnerConsoleFn = createServerFn({ method: 'GET' }).handler(
  () => readOwnerConsole(options())
);

export const grantFleetAccessFn = createServerFn({ method: 'POST' })
  .validator(fleetGrantInputSchema)
  .handler(({ data }) => sendGrant(data, options()));

export const revokeFleetAccessFn = createServerFn({ method: 'POST' })
  .validator(fleetRevokeInputSchema)
  .handler(({ data }) => sendRevoke(data, options()));

export const setFleetStoppedFn = createServerFn({ method: 'POST' })
  .validator(fleetControlInputSchema)
  .handler(({ data }) => sendControl(data, options()));

export const upsertFleetProjectFn = createServerFn({ method: 'POST' })
  .validator(fleetProjectInputSchema)
  .handler(({ data }) => sendProject(data, options()));

export const setFleetDisplayValueFn = createServerFn({ method: 'POST' })
  .validator(fleetDisplayValueInputSchema)
  .handler(({ data }) => sendDisplayValue(data, options()));
