/** The closed `ttr+identity` claim profile, shared by `./verify` and `./tokens`. */
import { AUTH_METHODS, type AuthMethod } from './auth-methods';
import type { JsonValue } from './encoding';
import {
  type ClaimProfile,
  isGeneration,
  isId16,
  isUserId,
  prefixedAudience,
} from './token-claims';
import { isTimestamp, MAX_TOKEN_LIFETIME_SECONDS } from './token-core';

const REQUIRED = [
  'iss',
  'env',
  'aud',
  'sub',
  'sid',
  'gen',
  'src',
  'stale',
  'aal',
  'amr',
  'auth_time',
  'iat',
  'exp',
  'jti',
] as const;

const IPV4_PREFIX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.0\/24$/;

/** Expands an IPv6 address to eight hextets, or null if it is not one. */
function ipv6Hextets(address: string): number[] | null {
  if (!/^[0-9a-f:]{2,39}$/.test(address)) return null;
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === '' ? [] : part.split(':'));
  const head = parse(halves[0] ?? '');
  const tail = halves.length === 2 ? parse(halves[1] ?? '') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [
    ...head,
    ...Array<string>(halves.length === 2 ? missing : 0).fill('0'),
    ...tail,
  ];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

/** RFC 5952 text for eight hextets: lowercase, no leading zeros, longest zero run as `::`. */
function canonicalIpv6(hextets: number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < 8; start += 1) {
    let length = 0;
    while (start + length < 8 && hextets[start + length] === 0) length += 1;
    if (length > bestLength && length >= 2) {
      bestStart = start;
      bestLength = length;
    }
  }
  const text = hextets.map((group) => group.toString(16));
  if (bestStart === -1) return text.join(':');
  return `${text.slice(0, bestStart).join(':')}::${text.slice(bestStart + bestLength).join(':')}`;
}

/**
 * `ipp` is an IPv4 `/24` with a zero last octet, or an IPv6 `/48` whose host
 * bits are zero, written in canonical RFC 5952 form.
 */
function isIpPrefix(value: string): boolean {
  if (value.endsWith('/48')) {
    const hextets = ipv6Hextets(value.slice(0, -3));
    if (!hextets || hextets.slice(3).some((group) => group !== 0)) return false;
    return `${canonicalIpv6(hextets)}/48` === value;
  }
  const v4 = IPV4_PREFIX.exec(value);
  if (v4) {
    return v4
      .slice(1)
      .every(
        (octet) => Number(octet) <= 255 && String(Number(octet)) === octet
      );
  }
  return false;
}

export function readAmr(value: JsonValue | undefined): AuthMethod[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8)
    return null;
  const methods = new Set<AuthMethod>();
  for (const entry of value) {
    if (
      typeof entry !== 'string' ||
      !AUTH_METHODS.includes(entry as AuthMethod)
    ) {
      return null;
    }
    methods.add(entry as AuthMethod);
  }
  return methods.size === value.length ? [...methods] : null;
}

export const IDENTITY_PROFILE: ClaimProfile = Object.freeze({
  tokenClass: 'identity',
  members: new Set<string>([...REQUIRED, 'ipp']),
  required: REQUIRED,
  audience: prefixedAudience('mount'),
  check(claims) {
    const { sub, sid, gen, src, stale, aal, ipp } = claims;
    return isUserId(sub) &&
      isId16(sid) &&
      isGeneration(gen) &&
      (src === 'cookie' || src === 'bearer') &&
      typeof stale === 'boolean' &&
      (aal === 'aal1' || aal === 'aal2') &&
      readAmr(claims.amr) !== null &&
      (ipp === undefined || (typeof ipp === 'string' && isIpPrefix(ipp))) &&
      isTimestamp(claims.auth_time)
      ? null
      : 'claims';
  },
  lifetime: () => MAX_TOKEN_LIFETIME_SECONDS.identity,
  timing: (claims, iat) => (claims.auth_time as number) <= iat,
});
