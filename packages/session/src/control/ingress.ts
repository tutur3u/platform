/**
 * Ingress classification for the session subject, decided by the address
 * alone. An address is class `worker` only inside Cloudflare's published
 * ranges, which the host passes in; `CF-Worker` is read only for such an
 * address, so a client outside them cannot choose its class or bucket.
 *
 * Trust boundary: the published ranges and the platform's own zone are
 * trusted host values; the ranges are copied once at entry by own index into
 * fresh structures. The address and `CF-Worker` header are request strings,
 * each read once and parsed as text. No untrusted JSON enters here.
 */
import {
  type CidrRange,
  cidrContains,
  displayPrefix,
  type IpAddress,
  limitPrefix,
  parseCidr,
  parseIpAddress,
} from './ip-address';
import { ownElements, ownValue } from './own-data';

export type IngressClass = 'public' | 'worker' | 'unknown';

/** The conservative shared bucket for an address that does not parse. */
export const UNKNOWN_BUCKET = 'unknown';
/** The shared bucket for Cloudflare addresses with no usable zone. */
export const SHARED_WORKER_BUCKET = 'worker';

export type CloudflareRanges = Readonly<{
  ranges: readonly CidrRange[];
  /** Entries that did not parse; the host alerts on any. */
  invalid: readonly string[];
}>;

export type IngressClassification = Readonly<{
  class: IngressClass;
  limitKey: string;
  /** The assertion's `ipp`, or null when the address is unknown. */
  ipp: string | null;
  /**
   * Compiled ranges that were malformed and dropped when copied; the host
   * alerts on any, as it does on `CloudflareRanges.invalid`.
   */
  droppedRanges: number;
}>;

const ZONE = /^[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/u;

/** Parses the published Cloudflare ranges once, keeping the valid ones. */
export function compileCloudflareRanges(
  list: readonly string[]
): CloudflareRanges {
  const ranges: CidrRange[] = [];
  const invalid: string[] = [];
  for (const entry of ownElements(list) ?? []) {
    const range = typeof entry === 'string' ? parseCidr(entry) : null;
    if (range) ranges.push(range);
    else invalid.push(String(entry));
  }
  return Object.freeze({
    ranges: Object.freeze(ranges),
    invalid: Object.freeze(invalid),
  });
}

/** Own number elements in `[0, max]`, exactly `count` of them, or null. */
function ownParts(value: unknown, count: number, max: number): number[] | null {
  const elements = ownElements(value);
  if (!elements || elements.length !== count) return null;
  const parts: number[] = [];
  for (const element of elements) {
    if (!Number.isSafeInteger(element)) return null;
    const part = element as number;
    if (part < 0 || part > max) return null;
    parts.push(part);
  }
  return parts;
}

/** One compiled range, copied as own data, or null when it is malformed. */
function copyRange(value: unknown): CidrRange | null {
  if (typeof value !== 'object' || value === null) return null;
  const address = ownValue(value, 'address');
  const prefix = ownValue(value, 'prefix');
  if (typeof address !== 'object' || address === null) return null;
  if (typeof prefix !== 'number' || !Number.isSafeInteger(prefix)) return null;
  const family = ownValue(address, 'family');
  let copy: IpAddress | null = null;
  if (family === 4) {
    const octets = ownParts(ownValue(address, 'octets'), 4, 0xff);
    if (octets) copy = Object.freeze({ family: 4, octets });
  } else if (family === 6) {
    const groups = ownParts(ownValue(address, 'groups'), 8, 0xffff);
    if (groups) copy = Object.freeze({ family: 6, groups });
  }
  if (!copy || prefix < 0 || prefix > (copy.family === 4 ? 32 : 128)) {
    return null;
  }
  return Object.freeze({ address: copy, prefix });
}

type RangeCopy = Readonly<{ ranges: readonly CidrRange[]; dropped: number }>;

/**
 * The compiled ranges, copied once, and how many were dropped. A malformed
 * range is dropped: an address it would have covered is classed `public` and
 * bucketed by its own prefix, and `CF-Worker` is ignored for it.
 */
function copyRanges(value: unknown): RangeCopy {
  if (typeof value !== 'object' || value === null) {
    return { ranges: [], dropped: 0 };
  }
  const ranges: CidrRange[] = [];
  let dropped = 0;
  for (const entry of ownElements(ownValue(value, 'ranges')) ?? []) {
    const range = copyRange(entry);
    if (range) ranges.push(range);
    else dropped += 1;
  }
  return { ranges, dropped };
}

/**
 * The calling Worker's zone from `CF-Worker`: lowercase, a valid hostname,
 * and neither the platform's own zone nor a subdomain of it.
 */
function workerZone(header: unknown, ownZone: unknown): string | null {
  const zone = typeof header === 'string' ? header.trim().toLowerCase() : '';
  if (!zone || zone.length > 253 || !ZONE.test(zone)) return null;
  const own = typeof ownZone === 'string' ? ownZone.trim().toLowerCase() : '';
  if (own && (zone === own || zone.endsWith(`.${own}`))) return null;
  return zone;
}

/**
 * Classifies a request's `cf-connecting-ip`.
 *
 * - `public`: a valid address outside the ranges; its limit key is the IPv4
 *   `/24` or IPv6 `/64` of the expanded address, and `CF-Worker` is ignored.
 * - `worker`: a valid address inside the ranges; its key is `worker:<zone>`
 *   when `CF-Worker` names another zone, otherwise the shared Worker bucket.
 * - `unknown`: no valid address; the shared `unknown` bucket and no `ipp`.
 */
export function classifyIngress(input: {
  address: string | null | undefined;
  cloudflareRanges: CloudflareRanges;
  cfWorker?: string | null;
  ownZone: string;
}): IngressClassification {
  const addressText: unknown = input.address;
  const cfWorker: unknown = input.cfWorker;
  const ownZone: unknown = input.ownZone;
  const { ranges, dropped: droppedRanges } = copyRanges(input.cloudflareRanges);
  const address = parseIpAddress(addressText as string | null | undefined);
  if (!address) {
    return Object.freeze({
      class: 'unknown',
      limitKey: UNKNOWN_BUCKET,
      ipp: null,
      droppedRanges,
    });
  }
  const ipp = displayPrefix(address);
  let inside = false;
  for (const range of ranges) {
    if (cidrContains(range, address)) inside = true;
  }
  if (!inside) {
    return Object.freeze({
      class: 'public',
      limitKey: limitPrefix(address),
      ipp,
      droppedRanges,
    });
  }
  const zone = workerZone(cfWorker, ownZone);
  return Object.freeze({
    class: 'worker',
    limitKey: zone ? `worker:${zone}` : SHARED_WORKER_BUCKET,
    ipp,
    droppedRanges,
  });
}
