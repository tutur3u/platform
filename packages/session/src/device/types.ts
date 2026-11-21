/**
 * Types of the device state machine: the stored state, its ports, the
 * mutations and their results. Everything here is data; the reducer modules
 * compute over it without a clock, random source or network.
 */
import type { JsonValue } from '../encoding';
import type { AssuranceLevel, AuthMethod, UserId } from '../principal';
import type { ProviderName, UpstreamGrant } from '../provider';
import type { GrantAct, IssuerId, RouteId } from './registry';

export type FactorMethod = 'totp' | 'passkey';
export type FactorRole = 'second_factor' | 'sign_in';
export type SessionFactor = {
  factorId: string;
  method: FactorMethod;
  role: FactorRole;
};

export type SessionKind =
  | 'browser'
  | 'child'
  | 'mobile'
  | 'cli'
  | 'external_app';

export type RevokeReason =
  | 'logout'
  | 'user'
  | 'admin'
  | 'epoch'
  | 'evicted'
  | 'replaced'
  | 'parent';

/** One session row in its device. Times are epoch milliseconds. */
export type SessionRow = {
  sid: string;
  userId: UserId;
  kind: SessionKind;
  /** Set for a child session on a subdomain host. */
  parentSid: string | null;
  host: string | null;
  callback: string | null;
  createdAt: number;
  lastSeenAt: number;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
  authTime: number;
  aal: AssuranceLevel;
  amr: AuthMethod[];
  provider: ProviderName | null;
  providerSubject: string | null;
  /** Moved into the revocation outbox when the session is revoked. */
  upstream: UpstreamGrant | null;
  epochSeen: number;
  revokedAt: number | null;
  revokedReason: RevokeReason | null;
  /** The index slot this session was admitted under; a child keeps its parent's. */
  reservationId: string;
  factors: SessionFactor[];
  /** True only if its sign-in presented totp or a user-verified passkey. */
  secondFactorSatisfied: boolean;
  /** A child's own host cookie secret hash; null for every other kind. */
  childSecretHash: Uint8Array | null;
};

export type EffectState = 'pending' | 'acked' | 'superseded' | 'abandoned';

export type RevocationOutbox = {
  /** Device generation at revocation. */
  gen: number;
  /** The revoked session, or the acting session of a credential change. */
  sessionId: string;
  /** Set for a credential-change row: the issuers revoke credentials resolved before it. */
  changedAt: number | null;
  /** The revocation time, or the change time of a credential-change row. */
  createdAt: number;
  upstream: UpstreamGrant | null;
  effects: {
    upstream: EffectState;
    cookie: EffectState;
    credentials: Partial<Record<IssuerId, EffectState>>;
  };
  attempts: {
    upstream: number;
    credentials: Partial<Record<IssuerId, number>>;
  };
  nextAttemptMs: number;
};

export type StepUpGrant = {
  id: string;
  sid: string;
  gen: number;
  act: GrantAct;
  /** Canonical base64url of `paramsHash(act, params)`. */
  ph: string;
  expiresAtMs: number;
  consumedBy?: string;
};

export type MutationKind = DeviceMutation['kind'];
export type RecordedKind = Exclude<
  MutationKind,
  'revoke' | 'revoke_user_below_epoch' | 'revoke_user_on_device'
>;

export type OperationRecord = {
  kind: RecordedKind;
  requestHash: Uint8Array;
  result: OperationResult;
  effects: Effect[];
  expiresAtMs: number;
};

/**
 * An expired record id. `fencedOnly` marks a `switch` or `rotate` id, which
 * may be dropped before its 7 days when the id map is full.
 */
export type ExpiredOperation = { expiredAtMs: number; fencedOnly: boolean };

export type DeviceState = {
  /** 0 when the store holds nothing; +1 per committed write. */
  version: number;
  activeSid: string | null;
  gen: number;
  secretHash: Uint8Array;
  grace: { secretHash: Uint8Array; gen: number; deadlineMs: number } | null;
  sessions: Record<string, SessionRow>;
  /** reservationId -> revokedAt, kept 30 days. */
  revokedReservations: Record<string, number>;
  /** Revoked session id, or `<sid>:change:<at>` for a credential change. */
  outbox: Record<string, RevocationOutbox>;
  grants: Record<string, StepUpGrant>;
  operations: Record<string, OperationRecord>;
  expiredOperations: Record<string, ExpiredOperation>;
};

/** Not part of `DeviceState`; it never travels in a snapshot. */
export type EpochCache = Record<string, { epoch: number; readAtMs: number }>;
export type EpochRaise = { userId: UserId; epoch: number; readAtMs: number };
export type EpochRead = {
  userId: UserId;
  epoch: number;
  readAtMs: number;
  status: 'fresh' | 'stale' | 'unavailable';
};

export type WriteOutcome = 'committed' | 'conflict' | 'unknown';

export interface DeviceStore {
  /** An empty device is version 0. */
  read(): Promise<DeviceState>;
  /**
   * One storage transaction: compare-and-set the state on `expectedVersion`,
   * then merge each epoch raise under `mergeEpochEntry`. `next.version` is
   * `expectedVersion + 1`, or equal to it for a raise-only write whose state
   * is the one read.
   */
  write(
    expectedVersion: number,
    next: DeviceState,
    epochRaises: EpochRaise[]
  ): Promise<WriteOutcome>;
  readEpochCache(): Promise<EpochCache>;
  /** Outside the version; applies `touchedSession`. */
  touch(sessionId: string, lastSeenAtMs: number): Promise<void>;
  /** Outside the version, in one storage transaction, with the same merge as write. */
  refreshEpochCache(read: EpochRead, nowMs: number): Promise<void>;
}

/** Minted fresh for every reserve that creates a slot. */
export type Reservation = { reservationId: string };

export type ReserveOutcome =
  | { kind: 'reserved'; reservation: Reservation }
  | {
      kind: 'swap';
      reservation: Reservation;
      evictDeviceId: string;
      evictReservationId: string;
    }
  | { kind: 'evicting' }
  | { kind: 'unavailable' };

export interface UserIndexPort {
  reserve(input: {
    userId: UserId;
    deviceId: string;
    operationId: string;
    cap: number;
    nowMs: number;
  }): Promise<ReserveOutcome>;
  confirm(reservation: Reservation): Promise<void>;
  release(reservation: Reservation): Promise<void>;
}

declare const freshFactorsBrand: unique symbol;
/** Only a `FactorReadPort` constructs one, through `freshFactors`. */
export type FreshFactors = Readonly<{
  userId: UserId;
  readAtMs: number;
  factors: readonly SessionFactor[];
}> & { readonly [freshFactorsBrand]: true };

export interface FactorReadPort {
  /** A fresh, uncached read from the identity provider; never a device snapshot. */
  read(userId: UserId): Promise<FreshFactors | 'unavailable'>;
}

export type Entropy = (bytes: number) => Uint8Array;
/** The keyed hash of a raw device or child secret (the host holds the pepper). */
export type SecretHasher = (secret: Uint8Array) => Promise<Uint8Array>;

/** Every session credential carries the `sid` that minted it; its store indexes by it. */
export type SessionBoundCredential = { sid: string };

/**
 * Stored per credential family. Every method is one atomic step under a
 * per-`sid` lock; `issuer.ts` holds the shared predicate and lifetimes.
 */
export interface SessionCredentialIssuer<
  Credential extends SessionBoundCredential = SessionBoundCredential,
> {
  readonly id: IssuerId;
  /**
   * One conditional write that commits only when `mintAllowed` holds inside
   * the lock: no tombstone, `resolvedAtMs >= watermark`, within -30 s / +5 s
   * of the issuer clock. The stored credential keeps its `resolvedAtMs`.
   */
  mint(
    sid: string,
    resolvedAtMs: number,
    credential: Credential
  ): Promise<'minted' | 'refused'>;
  /** Inserts the tombstone and revokes every credential of `sid`; an existing tombstone is success. */
  revokeForSession(sid: string): Promise<'ok' | 'failed'>;
  /** Raises the watermark to `changedAt` and revokes credentials resolved before it. */
  revokeForSessionBefore(
    sid: string,
    changedAt: number
  ): Promise<'ok' | 'failed'>;
  /** Rejects a credential whose `sid` has a tombstone. */
  validate(credential: Credential): Promise<boolean>;
}

/** The sign-in outcome the reducer accepts: the adapter's authenticated outcome plus passkey UV. */
export type SignInOutcome = {
  kind: 'authenticated';
  provider: ProviderName;
  providerSubject: string;
  userId: UserId;
  aal: AssuranceLevel;
  amr: readonly AuthMethod[];
  grant: UpstreamGrant | null;
  /** Whether a passkey in `amr` was asserted with user verification. */
  passkeyUserVerified: boolean;
  sessionKind: Exclude<SessionKind, 'child'>;
};

export type ChildSessionInput = {
  host: string;
  callback: string;
  kind: 'child';
};

/** `sessionId: null` fences a page rendered while the device had no active session. */
export type Fence = { sessionId: string | null; gen: number; version: number };

export type DeviceMutation = { operationId: string; nowMs: number } & (
  | {
      kind: 'sign_in';
      fence: Fence | null;
      outcome: SignInOutcome;
      reservation: Reservation;
      /** The swap's victim slot, when `reserve` returned `swap`. */
      eviction: { deviceId: string; reservationId: string } | null;
      capturedEpoch: number;
      epoch: EpochRead;
      factors: FreshFactors | 'unavailable';
    }
  | { kind: 'switch'; fence: Fence; targetSessionId: string; epoch: EpochRead }
  | { kind: 'rotate'; fence: Fence; epoch: EpochRead }
  | {
      kind: 'record_factors';
      fence: Fence;
      route: RouteId;
      grantId: string;
      params: JsonValue;
      credentialChange: null | { newEpoch: number };
      epoch: EpochRead;
      /** Required for `account.mfa.reset`, null otherwise. */
      factors: FreshFactors | 'unavailable' | null;
    }
  | {
      kind: 'redeem_child';
      codeParent: { sid: string; gen: number; epoch: number };
      child: ChildSessionInput;
      epoch: EpochRead;
    }
  | {
      kind: 'revoke';
      fence: Fence | null;
      sessionId: string;
      reason: RevokeReason;
    }
  | {
      kind: 'revoke_user_below_epoch';
      userId: UserId;
      belowEpoch: number;
      bumpedAtMs: number;
    }
  | { kind: 'revoke_user_on_device'; userId: UserId; reservationId: string }
  | {
      kind: 'grant_step_up';
      fence: Fence;
      route: RouteId;
      params: JsonValue;
      epoch: EpochRead;
    }
  | {
      kind: 'consume_step_up';
      fence: Fence;
      route: RouteId;
      grantId: string;
      params: JsonValue;
      epoch: EpochRead;
    }
);

export type MutationOf<K extends MutationKind> = Extract<
  DeviceMutation,
  { kind: K }
>;

export type FailureReason =
  | 'invalid_operation'
  | 'superseded'
  | 'idempotency_mismatch'
  | 'expired_idempotency'
  | 'epoch_unavailable'
  | 'factors_unavailable'
  | 'credentials_changed'
  | 'second_factor_required'
  | 'factor_mismatch'
  | 'reauth_required'
  | 'signed_out'
  | 'grant_invalid'
  | 'grant_expired'
  | 'parent_unavailable'
  | 'not_found'
  | 'rate_limited'
  | 'retry_later'
  | 'unavailable';

export type OperationResult =
  | {
      ok: true;
      sessionId: string | null;
      gen: number;
      grantId: string | null;
      revoked: string[];
      alreadyRevoked: boolean;
    }
  | { ok: false; reason: FailureReason; revoked: string[] };

export type AuditEvent =
  | 'session.created'
  | 'session.rotated'
  | 'session.switched'
  | 'session.step_up'
  | 'session.step_up_consumed'
  | 'session.factors_changed'
  | 'session.child_created'
  | 'session.revoked'
  | 'session.sign_in_rejected';

/** A stored effect. Raw secrets are never stored; the commit loop attaches them. */
export type Effect =
  | {
      type: 'set_cookie';
      gen: number;
      maxAgeSeconds: number;
      secretHash: string;
    }
  | {
      type: 'set_child_cookie';
      sessionId: string;
      host: string;
      maxAgeSeconds: number;
      secretHash: string;
    }
  | {
      type: 'audit';
      event: AuditEvent;
      sessionId: string | null;
      userId: UserId | null;
      reason?: string;
    }
  | { type: 'tab_invalidate'; sessionId: string }
  | { type: 'index_confirm'; userId: UserId; reservationId: string }
  | { type: 'index_release'; userId: UserId; reservationId: string }
  | {
      type: 'evict_device';
      userId: UserId;
      deviceId: string;
      reservationId: string;
    }
  | { type: 'epoch_bump'; userId: UserId; act: GrantAct }
  | { type: 'revoke_upstream'; outboxKey: string; grant: UpstreamGrant }
  | {
      type: 'revoke_credentials';
      outboxKey: string;
      sessionId: string;
      issuer: IssuerId;
      /** Null revokes everything for the session; a time revokes what resolved before it. */
      before: number | null;
    };

/** An effect as the host receives it, with any raw secret minted in this commit. */
export type EmittedEffect =
  | Exclude<Effect, { type: 'set_cookie' } | { type: 'set_child_cookie' }>
  | (Extract<Effect, { type: 'set_cookie' }> & { secret: Uint8Array | null })
  | (Extract<Effect, { type: 'set_child_cookie' }> & {
      secret: Uint8Array | null;
    });
