import 'server-only';

import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { mastermindAccessPermission } from '@/lib/mastermind/access';
import { parseMastermindPushOwnerIds } from '@/lib/mastermind/push-events/delivery';
import {
  MASTERMIND_PUSH_SIGNATURE_HEADER,
  MASTERMIND_PUSH_TIMESTAMP_HEADER,
  verifyMastermindPushSignature,
} from '@/lib/mastermind/push-events/signature';
import { fleetSignedPayload } from './signing';

export const FLEET_SIGNATURE_HEADER = MASTERMIND_PUSH_SIGNATURE_HEADER;
export const FLEET_TIMESTAMP_HEADER = MASTERMIND_PUSH_TIMESTAMP_HEADER;

/**
 * Owner reads and answers also accept the Mastermind web Worker's satellite
 * session (target `mastermind`), the same admission as
 * `GET /api/v1/mastermind/access`.
 */
export const MASTERMIND_APP_SESSION = {
  targetApp: 'mastermind',
  requiredScope: 'internal-app:session',
} as const;

export function fleetOwnerIds(
  env: Record<string, string | undefined> = process.env
) {
  return parseMastermindPushOwnerIds(
    env.MASTERMIND_FLEET_OWNER_IDS || env.MASTERMIND_PUSH_OWNER_IDS
  );
}

/**
 * Owner-only: the root Mastermind permission (the same rule as
 * `GET /api/v1/mastermind/access`) and, as defence in depth, the owner
 * allowlist the push route uses. An empty allowlist admits nobody.
 */
export async function isFleetOwner(
  user: NonNullable<Parameters<typeof getPermissions>[0]['user']>,
  env: Record<string, string | undefined> = process.env
) {
  if (!fleetOwnerIds(env).includes(user.id.toLowerCase())) return false;
  try {
    const permissions = await getPermissions({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
    return (
      permissions?.containsPermission(mastermindAccessPermission(env)) ?? false
    );
  } catch {
    return false;
  }
}

/** HMAC check for the orchestrator publisher, bound to method, path and query. */
export function verifyFleetPublisher(
  request: Request,
  rawBody: string,
  env: Record<string, string | undefined> = process.env
) {
  const url = new URL(request.url);
  return verifyMastermindPushSignature({
    secret: env.MASTERMIND_FLEET_PUBLISHER_SECRET,
    nextSecret: env.MASTERMIND_FLEET_PUBLISHER_SECRET_NEXT,
    signature: request.headers.get(FLEET_SIGNATURE_HEADER),
    timestamp: request.headers.get(FLEET_TIMESTAMP_HEADER),
    rawBody: fleetSignedPayload(
      request.method,
      `${url.pathname}${url.search}`,
      rawBody
    ),
  });
}
