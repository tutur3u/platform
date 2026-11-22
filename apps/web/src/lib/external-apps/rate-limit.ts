import {
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { type Counter, consume, KEY_PREFIX, keyPart } from './rate-limit-core';
import type { ExternalAppRateLimitBucket } from './rate-limit-policy';

/**
 * Scope names the external-app handlers require. Kept here so the guard does
 * not load the handlers' server modules; a test pins them to the handlers'
 * exported scope constants.
 */
export const EXTERNAL_APP_ROUTE_SCOPE_NAMES = {
  cronRead: 'workspace:cron:read',
  cronWrite: 'workspace:cron:write',
  driveRead: 'workspace:drive:read',
  driveWrite: 'workspace:drive:write',
  membersRead: 'workspace:members:read',
  membersWrite: 'workspace:members:write',
  rolesRead: 'workspace:roles:read',
  rolesWrite: 'workspace:roles:write',
} as const;
const scope = EXTERNAL_APP_ROUTE_SCOPE_NAMES;

type RouteKind = 'invitation' | 'read' | 'uploadUrl' | 'write';

/**
 * Each routed external-app operation, its counter kind and the scopes its
 * handler requires. An operation missing here counts per user only.
 */
const ROUTES: Record<string, { kind: RouteKind; scopes: readonly string[] }> = {
  'GET cron': { kind: 'read', scopes: [scope.cronRead] },
  'GET cron/executions': { kind: 'read', scopes: [scope.cronRead] },
  'GET cron/jobs/[jobKey]/executions': {
    kind: 'read',
    scopes: [scope.cronRead],
  },
  'PATCH cron/jobs/[jobKey]': {
    kind: 'write',
    scopes: [scope.cronRead, scope.cronWrite],
  },
  'POST cron/jobs/[jobKey]/run-now': {
    kind: 'write',
    scopes: [scope.cronRead, scope.cronWrite],
  },
  'POST cron/setup': {
    kind: 'write',
    scopes: [scope.cronRead, scope.cronWrite],
  },
  'DELETE drive': { kind: 'write', scopes: [scope.driveWrite] },
  'POST drive/finalize': { kind: 'write', scopes: [scope.driveWrite] },
  // A signed read URL changes nothing, so it counts as a read.
  'POST drive/read-url': { kind: 'read', scopes: [scope.driveRead] },
  'POST drive/upload-url': { kind: 'uploadUrl', scopes: [scope.driveWrite] },
  'GET members': {
    kind: 'read',
    scopes: [scope.membersRead, scope.rolesRead],
  },
  'DELETE members/access': { kind: 'write', scopes: [scope.membersWrite] },
  'PATCH members/default-admin': {
    kind: 'write',
    scopes: [scope.membersWrite, scope.rolesWrite],
  },
  'POST members/invitations': {
    kind: 'invitation',
    scopes: [scope.membersWrite],
  },
  'PATCH members/[userId]/role': {
    kind: 'write',
    scopes: [scope.membersWrite, scope.rolesWrite],
  },
};

const READ_METHODS = new Set(['GET', 'HEAD']);

/**
 * The key part for the workspace the bearer is bound to, when the URL names
 * exactly that workspace. Only a bound workspace gets workspace counters, so
 * a token cannot spend another workspace's budget and URL strings never mint
 * keys before the handler authorizes them. Handles and `personal` are not
 * resolved here, so their requests count per user only.
 */
function boundWorkspaceKeyPart(wsId: string, boundWorkspaceId?: string) {
  const bound = boundWorkspaceId?.toLowerCase();
  if (!bound) return null;
  return resolveWorkspaceId(wsId).toLowerCase() === bound
    ? keyPart(bound)
    : null;
}

/**
 * The counters one external-app workspace request consumes. Every request is
 * counted per app and user, which caps a bearer however its URL names the
 * workspace. Workspace counters are added only for a bearer bound to the
 * requested workspace that holds every scope the route requires (exact
 * grants), so a member whose request the handler refuses cannot spend the
 * workspace's budget.
 */
export function externalAppWorkspaceCounters({
  appId,
  boundWorkspaceId,
  method,
  pattern,
  scopes,
  userId,
  wsId,
}: {
  appId: string;
  boundWorkspaceId?: string;
  method: string;
  pattern: readonly string[];
  scopes: readonly string[];
  userId: string;
  wsId: string;
}): Counter[] {
  const route =
    ROUTES[`${method === 'HEAD' ? 'GET' : method} ${pattern.join('/')}`];
  const kind: RouteKind =
    route?.kind ?? (READ_METHODS.has(method) ? 'read' : 'write');
  const app = keyPart(appId);
  const user = keyPart(userId);
  const workspace =
    route?.scopes.every((scope) => scopes.includes(scope)) &&
    boundWorkspaceKeyPart(wsId, boundWorkspaceId);

  // Reads fail open, as `checkRateLimit` does: a read changes nothing and
  // sends nothing, so a limiter outage should not take the app's reads down.
  const failClosed = kind !== 'read';
  const counter = (
    bucket: ExternalAppRateLimitBucket,
    owner: string
  ): Counter => ({
    bucket,
    failClosed,
    key: `${KEY_PREFIX}:${bucket}:app:${app}:${owner}`,
  });
  const perUser = (bucket: ExternalAppRateLimitBucket) =>
    counter(bucket, `user:${user}`);
  const perWorkspace = (bucket: ExternalAppRateLimitBucket) =>
    workspace ? [counter(bucket, `ws:${workspace}`)] : [];

  if (kind === 'read') {
    return [perUser('userRead'), ...perWorkspace('workspaceRead')];
  }
  const counters = [perUser('userWrite'), ...perWorkspace('workspaceWrite')];
  if (kind === 'uploadUrl') counters.push(perUser('userUploadUrl'));
  if (kind === 'invitation') {
    counters.push(
      perUser('userInvitation'),
      ...perWorkspace('workspaceInvitation')
    );
  }
  return counters;
}

/**
 * Limits an external-app workspace request by its verified bearer. A request
 * without a valid app bearer is left to the handler, which refuses it before
 * any database work.
 */
export async function limitExternalAppWorkspaceRequest(
  request: Request,
  {
    method,
    pattern,
    wsId,
  }: { method: string; pattern: readonly string[]; wsId: string }
) {
  if (method === 'OPTIONS') return undefined;
  const token = getBearerAppCoordinationToken(request);
  if (!token) return undefined;
  const verification = verifyAppCoordinationToken(token);
  if (!verification.ok) return undefined;

  const refusal = await consume(
    externalAppWorkspaceCounters({
      appId: verification.claims.target_app,
      boundWorkspaceId: verification.claims.workspace_id,
      method,
      pattern,
      scopes: verification.claims.scopes,
      userId: verification.claims.sub,
      wsId,
    })
  );
  return refusal ?? undefined;
}
