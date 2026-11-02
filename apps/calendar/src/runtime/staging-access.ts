import {
  stripCloudflareAccessCredentials,
  verifyCloudflareAccessRequest,
  withCloudflareAccessServiceToken,
} from '@tuturuuu/utils/cloudflare-access';
import {
  CALENDAR_STAGING_ISSUER_ORIGIN,
  isCalendarStagingArtifact,
} from './deployment-profile';
import type { CalendarWorkerEnvironment } from './worker-contract';

const noStore = { 'cache-control': 'private, no-store' };

/**
 * Staging only: Access fronts the host, and this Worker verifies the Access
 * JWT itself so a misconfigured or path-gapped Access app cannot expose it.
 * Production folds this to a no-op at build time.
 */
export async function denyWithoutStagingAccess(
  request: Request,
  env: CalendarWorkerEnvironment
): Promise<Response | null> {
  if (!isCalendarStagingArtifact()) return null;
  const admitted = await verifyCloudflareAccessRequest(request, {
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    audience: env.CF_ACCESS_AUD,
  });
  return admitted
    ? null
    : new Response('Forbidden', { status: 403, headers: noStore });
}

/**
 * Prepares a server-side forward to an API owner. Client Access credentials
 * never leave this Worker. In staging, requests to exactly the issuer origin
 * carry the Calendar service token and must not follow redirects; a missing
 * token fails closed without contacting the issuer.
 */
export function prepareOwnerRequest(
  request: Request,
  env: CalendarWorkerEnvironment
): Request | Response {
  const stripped = new Request(request, {
    headers: stripCloudflareAccessCredentials(new Headers(request.headers)),
  });
  if (!isCalendarStagingArtifact()) return stripped;
  if (new URL(stripped.url).origin !== CALENDAR_STAGING_ISSUER_ORIGIN)
    return stripped;
  const result = withCloudflareAccessServiceToken(
    stripped,
    CALENDAR_STAGING_ISSUER_ORIGIN,
    {
      clientId: env.CF_ACCESS_CLIENT_ID,
      clientSecret: env.CF_ACCESS_CLIENT_SECRET,
    }
  );
  return result.ok
    ? result.request
    : new Response('Issuer access unavailable', {
        status: 503,
        headers: noStore,
      });
}

export function fetchOwner(request: Request, env: CalendarWorkerEnvironment) {
  const prepared = prepareOwnerRequest(request, env);
  return prepared instanceof Response
    ? Promise.resolve(prepared)
    : fetch(prepared);
}
