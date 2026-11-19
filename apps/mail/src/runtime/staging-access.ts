import {
  stripCloudflareAccessCredentials,
  verifyCloudflareAccessRequest,
  withCloudflareAccessServiceToken,
} from '@tuturuuu/utils/cloudflare-access';
import {
  isMailStagingArtifact,
  MAIL_STAGING_ISSUER_ORIGIN,
} from './deployment-profile';
import type { MailRuntimeEnv } from './worker-contract';

const noStore = { 'cache-control': 'private, no-store' };

/**
 * Staging only: Access fronts the host, and this Worker verifies the Access
 * JWT itself so a misconfigured or path-gapped Access app cannot expose it.
 * Production folds this to a no-op at build time.
 */
export async function denyWithoutStagingAccess(
  request: Request,
  env: MailRuntimeEnv
): Promise<Response | null> {
  if (!isMailStagingArtifact()) return null;
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
 * carry the Mail service token and must not follow redirects; a missing
 * token fails closed without contacting the issuer.
 */
export function prepareOwnerRequest(
  request: Request,
  env: MailRuntimeEnv
): Request | Response {
  const stripped = new Request(request, {
    headers: stripCloudflareAccessCredentials(new Headers(request.headers)),
  });
  if (!isMailStagingArtifact()) return stripped;
  if (new URL(stripped.url).origin !== MAIL_STAGING_ISSUER_ORIGIN)
    return stripped;
  const result = withCloudflareAccessServiceToken(
    stripped,
    MAIL_STAGING_ISSUER_ORIGIN,
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

export function fetchOwner(request: Request, env: MailRuntimeEnv) {
  const prepared = prepareOwnerRequest(request, env);
  return prepared instanceof Response
    ? Promise.resolve(prepared)
    : fetch(prepared);
}
