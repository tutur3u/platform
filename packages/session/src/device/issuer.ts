/**
 * The session credential issuer contract. Credentials (AI temporary tokens,
 * handoff codes) are bound to the `sid` that minted them; the device keeps
 * no list of their ids. A store meets the contract only when it evaluates
 * `mintAllowed` inside the same per-`sid` lock as its write, inserts a
 * tombstone on `revokeForSession`, and raises a never-lowering watermark on
 * `revokeForSessionBefore`.
 */
import { MINT_ROUTES, type RouteId, type RouteRegistry } from './registry';
import { type ResolveInput, resolve } from './resolve';
import type { DeviceState, SessionCredentialIssuer } from './types';
import type { IssuerId } from './registry';

/** How far a mint's authorizing resolution may trail the issuer's clock at commit. */
export const RESOLVE_TO_COMMIT_MS = 30_000;
/** How far it may lead the issuer's clock, for skew between the two clocks. */
export const MINT_CLOCK_AHEAD_MS = 5_000;
/** The shortest a `sid` tombstone ever lives. */
export const MIN_TOMBSTONE_LIFETIME_MS = 300_000;

export type MintRoute = (typeof MINT_ROUTES)[keyof typeof MINT_ROUTES];
export type SessionCredentialIssuers = Readonly<
  Record<IssuerId, SessionCredentialIssuer>
>;

/**
 * The full mint predicate, evaluated under the per-`sid` lock, never before
 * it: no tombstone, at or after the watermark (a missing one does not
 * restrict), and within -30 s / +5 s of the issuer's clock. `resolvedAtMs` is
 * the device clock's time of the authorizing resolution, copied unchanged.
 */
export function mintAllowed(input: {
  tombstone: boolean;
  watermark: number | null;
  resolvedAtMs: number;
  issuerNowMs: number;
}): boolean {
  const { tombstone, watermark, resolvedAtMs, issuerNowMs } = input;
  if (!Number.isFinite(resolvedAtMs) || !Number.isFinite(issuerNowMs))
    return false;
  if (tombstone) return false;
  if (watermark !== null && resolvedAtMs < watermark) return false;
  return (
    resolvedAtMs >= issuerNowMs - RESOLVE_TO_COMMIT_MS &&
    resolvedAtMs <= issuerNowMs + MINT_CLOCK_AHEAD_MS
  );
}

/**
 * A tombstone outlives every credential that could still commit after the
 * revocation: at least 300 seconds, and at least the longest credential
 * lifetime plus the resolve-to-commit bound.
 */
export function tombstoneLifetimeMs(
  longestCredentialLifetimeMs: number
): number {
  return Math.max(
    MIN_TOMBSTONE_LIFETIME_MS,
    longestCredentialLifetimeMs + RESOLVE_TO_COMMIT_MS
  );
}

/** A credential-change watermark lives the resolve-to-commit bound plus the longest lifetime. */
export function watermarkLifetimeMs(
  longestCredentialLifetimeMs: number
): number {
  return RESOLVE_TO_COMMIT_MS + longestCredentialLifetimeMs;
}

export function isMintRoute(route: unknown): route is MintRoute {
  return (
    typeof route === 'string' &&
    (Object.values(MINT_ROUTES) as string[]).includes(route)
  );
}

export type MintAuthority =
  | { ok: true; sid: string; resolvedAtMs: number }
  | {
      ok: false;
      reason:
        | 'invalid_operation'
        | 'signed_out'
        | 'rotated'
        | 'account_mismatch'
        | 'epoch_unavailable';
    };

/**
 * The authority an issuer mints under: the request's current device secret
 * resolved through a declared mint route. The grace secret gets `rotated`
 * and a revoked or expired session `signed_out`, so neither can mint.
 */
export function mintAuthority(
  state: DeviceState,
  input: Omit<ResolveInput, 'route'> & { route: RouteId },
  registry: RouteRegistry
): MintAuthority {
  if (!isMintRoute(input.route) || !registry.has(input.route)) {
    return { ok: false, reason: 'invalid_operation' };
  }
  const declaration = registry.get(input.route);
  if (declaration.class !== 'credential' || !declaration.accountScoped) {
    return { ok: false, reason: 'invalid_operation' };
  }
  const resolved = resolve(state, input, registry);
  if (resolved.kind !== 'resolved') return { ok: false, reason: resolved.kind };
  if (resolved.stale) return { ok: false, reason: 'rotated' };
  return {
    ok: true,
    sid: resolved.sessionId,
    resolvedAtMs: resolved.resolvedAtMs,
  };
}
