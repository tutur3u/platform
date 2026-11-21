/**
 * `@tuturuuu/session/device`: the device state machine as a pure reducer over
 * injected ports. The host supplies storage, the user index, fresh epoch and
 * factor reads, entropy and the secret hasher; nothing here reads a clock,
 * a random source or the network.
 */
export {
  COMMIT_ATTEMPTS,
  type CommitDeps,
  type CommitOutcome,
  commitMutation,
} from './device/commit';
export {
  acknowledgeEffects,
  type DrainPorts,
  type DrainReport,
  runDrain,
  settleResponseCookie,
  type UpstreamRevokePort,
} from './device/drain';
export {
  checkEpochRead,
  EPOCH_CACHE_MAX_AGE_MS,
  FRESH_READ_MAX_AGE_MS,
  freshFactors,
  mergeEpochCache,
  refreshRaise,
  replacesEpochEntry,
} from './device/epoch';
export { requestHash } from './device/hash';
export {
  applyEffectResults,
  type CookieDirective,
  type CookieScope,
  DRAIN_DELAYS_MS,
  type DrainAlert,
  type DrainTask,
  type EffectResult,
  MAX_DRAIN_ATTEMPTS,
  planDrain,
  prune,
  REVOKED_RESERVATION_RETENTION_MS,
  REVOKED_ROW_RETENTION_MS,
  settleCookies,
} from './device/outbox';
export {
  isMintRoute,
  MIN_TOMBSTONE_LIFETIME_MS,
  MINT_CLOCK_AHEAD_MS,
  type MintAuthority,
  mintAllowed,
  mintAuthority,
  type MintRoute,
  RESOLVE_TO_COMMIT_MS,
  type SessionCredentialIssuers,
  tombstoneLifetimeMs,
  watermarkLifetimeMs,
} from './device/issuer';
export { normalizeParams } from './device/params';
export {
  EXPIRED_ID_TTL_MS,
  MAX_EXPIRED_IDS,
  MAX_RECORDS,
  type OperationStatus,
  operationStatus,
  RECORD_TTL_MS,
} from './device/records';
export { SWITCH_MAX_AUTH_AGE_MS } from './device/reduce-account';
export {
  MAX_LIVE_CHILDREN,
  MAX_RETAINED_CHILDREN,
} from './device/reduce-child';
export type { DeviceContext } from './device/reduce-common';
export { MAX_DEVICE_USERS } from './device/reduce-sign-in';
export { GRANT_TTL_MS } from './device/reduce-step-up';
export {
  actSpec,
  createRouteRegistry,
  FACTOR_ACTS,
  GRANT_ACTS,
  type GrantAct,
  ISSUER_IDS,
  type IssuerId,
  isGrantAct,
  MINT_ROUTES,
  type ParamType,
  type RouteClass,
  type RouteDeclaration,
  type RouteId,
  type RouteRegistry,
  UNKNOWN_ROUTE,
} from './device/registry';
export {
  type ResolveInput,
  type ResolveResult,
  resolve,
} from './device/resolve';
export {
  emptyDeviceState,
  GRACE_MS,
  isLive,
  MAX_GENERATION,
  TOUCH_INTERVAL_MS,
  touchedSession,
} from './device/sessions';
export {
  leaseDecision,
  type SignInRequest,
  signInWithReservation,
} from './device/sign-in-flow';
export type { JsonValue } from './encoding';
export type * from './device/types';
