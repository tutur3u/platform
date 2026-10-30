import { CLOUDFLARE_ORIGIN_AUTH_HEADER } from '@tuturuuu/utils/abuse-protection/client-ip';
import { verifyOriginClientIpProof } from '@tuturuuu/utils/abuse-protection/origin-ip-proof';

type ProxyHandler<Req extends Request, Res extends Response> = (
  request: Req
) => Promise<Res>;

/** Only the staging Web build sets this public flag (staging-web-publisher §4.4). */
export function isStagingWebDeployment(
  env: Record<string, string | undefined> = process.env
) {
  return env.NEXT_PUBLIC_TUTURUUU_STAGING === '1';
}

/**
 * Staging Next serves only requests relayed by the staging issuer Worker
 * (staging-web-publisher V1a). Every request the proxy matcher reaches must
 * carry a fresh signed origin proof made with `TRUSTED_PROXY_ORIGIN_SECRET`;
 * otherwise it gets 403, so a direct `*.vercel.app` hit needs both the
 * Vercel bypass secret and the origin-proof secret. A missing or short secret
 * also yields 403. Only the HMAC proof counts; the raw shared secret does not.
 * Production and other deployments never set the flag and are unaffected.
 */
export function withStagingOriginProof<
  Req extends Request,
  Res extends Response,
>(
  handler: ProxyHandler<Req, Res>,
  forbidden: () => Res,
  env: Record<string, string | undefined> = process.env
): ProxyHandler<Req, Res> {
  return async (request) => {
    if (
      isStagingWebDeployment(env) &&
      !verifyOriginClientIpProof({
        proof: request.headers.get(CLOUDFLARE_ORIGIN_AUTH_HEADER),
        secret: env.TRUSTED_PROXY_ORIGIN_SECRET,
      })
    )
      return forbidden();
    return handler(request);
  };
}
