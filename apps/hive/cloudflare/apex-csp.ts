import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import { hiveApexMounts } from './apex-mount.ts';

const mounts = { app: 'hive', ...hiveApexMounts };

/**
 * The enforced policy for Hive documents on tuturuuu.com/hive (D360 R2):
 * scripts only by this response's nonce (and what they load, via
 * 'strict-dynamic'), no plugins, no <base>, never framed. No 'unsafe-inline',
 * no 'unsafe-eval' and no host allowlist.
 */
export function hiveMountedContentSecurityPolicy(nonce: string) {
  return [
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "form-action 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Report-only Trusted Types on the mount: DOM XSS sinks are reported in the
 * browser console during the signed-in QA period before enforcement.
 */
export const HIVE_MOUNTED_REPORT_ONLY_POLICY =
  "require-trusted-types-for 'script'";

/** Whether this request is the apex mount (never a header; the URL only). */
export function isHiveMountedRequest(request: Request) {
  return resolveAppBase(new URL(request.url), mounts)?.mode === 'mounted';
}

/**
 * `csp` for the bridge handler: the strict policy on the apex mount only.
 * hive.tuturuuu.com keeps today's headers (`null`).
 */
export function hiveContentSecurityPolicy(
  nonce: string,
  context: { request: Request }
) {
  return isHiveMountedRequest(context.request)
    ? hiveMountedContentSecurityPolicy(nonce)
    : null;
}
