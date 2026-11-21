/**
 * Who a request from a shared Cloudflare address belongs to. Cloudflare sets
 * `CF-Worker` to the zone of the Worker that made a subrequest, and a Worker
 * cannot override it. Behind the apex gateway that header names the gateway's
 * own zone, so the gateway forwards the incoming value in
 * `x-tuturuuu-origin-worker`, which is trusted only with a valid origin proof.
 */
import {
  CLOUDFLARE_ORIGIN_AUTH_HEADER,
  type ClientIpConfig,
  type ClientIpHeaders,
  readHeader as header,
  resolveTrustedProxyConfig,
} from './client-ip';
import { isCloudflareIp } from './cloudflare-ip-ranges';
import { verifyOriginClientIpProof } from './origin-ip-proof';

export { isCloudflareIp };
export const ORIGIN_WORKER_HEADER = 'x-tuturuuu-origin-worker';
const ZONE = /^[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/u;
// The platform's own Workers name its zone; that says nothing about a caller.
const OWN_ZONE = /(?:^|\.)tuturuuu\.com$/u;

/** The calling Worker's zone for a request from Cloudflare address `ip`. */
export function cloudflareWorkerZone(
  headers: ClientIpHeaders,
  ip: string,
  config: ClientIpConfig = resolveTrustedProxyConfig()
): string | null {
  if (!isCloudflareIp(ip)) return null;
  const signed =
    config.mode === 'cloudflare-origin' &&
    verifyOriginClientIpProof({
      proof: header(headers, CLOUDFLARE_ORIGIN_AUTH_HEADER),
      secret: config.originAuthSecret,
    }) === ip;
  const zone = header(headers, signed ? ORIGIN_WORKER_HEADER : 'cf-worker')
    ?.trim()
    .toLowerCase();
  if (!zone || zone.length > 253 || !ZONE.test(zone) || OWN_ZONE.test(zone))
    return null;
  return zone;
}

/**
 * The key IP blocks and abuse escalation apply to: the address itself, the
 * calling Worker zone for a shared Cloudflare address, or `unknown` (never
 * blocked) for a shared address with no zone.
 */
export function abuseSubject(
  headers: ClientIpHeaders,
  ip: string,
  config?: ClientIpConfig
): string {
  if (!ip || ip === 'unknown') return 'unknown';
  if (!isCloudflareIp(ip)) return ip;
  const zone = cloudflareWorkerZone(headers, ip, config);
  return zone ? `worker:${zone}` : 'unknown';
}
