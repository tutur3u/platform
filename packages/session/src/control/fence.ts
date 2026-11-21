/**
 * The stop-fence mode table. Every consumer asks one lookup whether an
 * operation may run under the snapshot it holds, the deployed
 * `TTR_SESSION_FENCE_FLOOR` and its clock. Security cleanup is never parked;
 * `background: parked` and budget parks reach only background work.
 *
 * Trust boundary: every input is a trusted host value: the operation
 * descriptor, the snapshot from the host's own fence Durable Object, the
 * floor and `nowMs`. No untrusted JSON enters here. Each field is still read
 * exactly once at entry as an own data property and `budgetParks` is copied
 * once, so an inherited field or a getter cannot supply a decision field and
 * a value cannot show one thing to a check and another to the decision.
 */
import { ownStrings, ownValue } from './own-data';

export type FenceMode = 'running' | 'issuance_stopped' | 'stopped';
export type BackgroundState = 'running' | 'parked';

export const FENCE_MODES: readonly FenceMode[] = Object.freeze([
  'running',
  'issuance_stopped',
  'stopped',
]);

/** The accounting categories a budget can park. */
export type AccountingCategory =
  | 'control'
  | 'abuse'
  | 'epoch'
  | 'index'
  | 'session'
  | 'credential'
  | 'keys';

/** Issuance refuses a snapshot older than this. */
export const FENCE_ISSUANCE_MAX_AGE_MS = 10_000;
/** Resolution answers `unavailable` past this snapshot age. */
export const FENCE_RESOLUTION_MAX_AGE_MS = 300_000;
/** A snapshot whose `readAtMs` is further ahead of the clock is ignored. */
export const FENCE_FUTURE_TOLERANCE_MS = 5_000;

/** Step-up acts `issuance_stopped` keeps: both replace or remove access. */
export const ISSUANCE_STOPPED_ACTS: readonly string[] = Object.freeze([
  'sessions.revoke_all',
  'account.password',
]);

export type FenceSnapshot = Readonly<{
  mode: FenceMode;
  version: number;
  readAtMs: number;
  background?: BackgroundState;
  budgetParks?: readonly AccountingCategory[];
}>;

export type BackgroundWork = 'census' | 'pruning' | 'lease' | 'index_touch';

export type FenceOperation =
  /** Identity assertions for existing sessions: `resolveForMount`, `resolve`. */
  | Readonly<{ kind: 'resolve' }>
  /** `requireLive` and `liveness`. */
  | Readonly<{ kind: 'liveness' }>
  /** `sign_in`, `redeem_child`, `rotate`, `switch`. */
  | Readonly<{ kind: 'session_issue' }>
  /** AI token, handoff code, realtime, access, refresh and step-up proof. */
  | Readonly<{ kind: 'credential_mint' }>
  | Readonly<{ kind: 's2s_mint' }>
  /** Step-up grant and consume, and `record_factors`, for one act. */
  | Readonly<{ kind: 'step_up'; act: string }>
  | Readonly<{ kind: 'record_factors'; act: string }>
  | Readonly<{ kind: 'logout_own' }>
  /** Revoke one and revoke-all on a user path. */
  | Readonly<{ kind: 'revoke_user' }>
  /** Admin revoke and admin "compromised". */
  | Readonly<{ kind: 'revoke_admin' }>
  /** Upstream and credential revokes, tombstones, epoch fan-out, audit sink. */
  | Readonly<{ kind: 'security_cleanup' }>
  | Readonly<{
      kind: 'background';
      work: BackgroundWork;
      category: AccountingCategory;
    }>;

export type FenceDecision =
  | Readonly<{ allowed: true; mode: FenceMode; version: number | null }>
  | Readonly<{
      allowed: false;
      /**
       * `forbidden`: the effective mode refuses it. `parked`: background work
       * the consumer parks for the fence version. `stale`: issuance without a
       * snapshot younger than 10 seconds. `unavailable`: resolution or a
       * user-path revoke past the 5-minute fuse or with no usable snapshot,
       * or background work without a fresh snapshot, which retries rather
       * than parks.
       */
      reason: 'forbidden' | 'parked' | 'stale' | 'unavailable';
      mode: FenceMode | null;
      version: number | null;
    }>;

const RANK: Readonly<Record<FenceMode, number>> = {
  running: 0,
  issuance_stopped: 1,
  stopped: 2,
};

export function isFenceMode(value: unknown): value is FenceMode {
  return typeof value === 'string' && FENCE_MODES.includes(value as FenceMode);
}

/** The stricter of two modes. */
export function stricterMode(left: FenceMode, right: FenceMode): FenceMode {
  return RANK[left] >= RANK[right] ? left : right;
}

/**
 * `TTR_SESSION_FENCE_FLOOR`: unset or empty is `running`. Any other value
 * that is not a mode is read as `stopped`, so a mistyped break-glass floor
 * fails closed.
 */
export function parseFenceFloor(value: string | null | undefined): FenceMode {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed === '') return 'running';
  return isFenceMode(trimmed) ? trimmed : 'stopped';
}

type KnownSnapshot = Readonly<{
  mode: FenceMode;
  version: number;
  age: number;
  parked: boolean;
  budgetParks: readonly string[];
}>;

/**
 * The snapshot, read once as own data, or null when it is missing, invalid or
 * too far ahead of the clock. A `mode` that is not an own data property makes
 * it unusable. `budgetParks`, when present, must be an array of own string
 * elements.
 */
function readSnapshot(value: unknown, nowMs: unknown): KnownSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const mode = ownValue(value, 'mode');
  const version = ownValue(value, 'version');
  const readAtMs = ownValue(value, 'readAtMs');
  const background = ownValue(value, 'background');
  const budgetParks = ownValue(value, 'budgetParks');
  const parks = budgetParks === undefined ? [] : ownStrings(budgetParks);
  if (
    !isFenceMode(mode) ||
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    typeof readAtMs !== 'number' ||
    !Number.isSafeInteger(readAtMs) ||
    typeof nowMs !== 'number' ||
    !Number.isSafeInteger(nowMs) ||
    !parks
  ) {
    return null;
  }
  const age = nowMs - readAtMs;
  if (age < -FENCE_FUTURE_TOLERANCE_MS) return null;
  return Object.freeze({
    mode,
    version,
    age,
    parked: background === 'parked',
    budgetParks: Object.freeze(parks),
  });
}

/**
 * The operation's own data fields, each read once. A `kind` that is not an
 * own data property is missing, which every mode refuses as `forbidden`.
 */
function readOperation(value: unknown): FenceOperation | null {
  if (typeof value !== 'object' || value === null) return null;
  return Object.freeze({
    kind: ownValue(value, 'kind'),
    act: ownValue(value, 'act'),
    work: ownValue(value, 'work'),
    category: ownValue(value, 'category'),
  }) as FenceOperation;
}

type Table = Readonly<Record<FenceMode, boolean>>;
const ALL: Table = { running: true, issuance_stopped: true, stopped: true };
const NOT_STOPPED: Table = {
  running: true,
  issuance_stopped: true,
  stopped: false,
};
const RUNNING_ONLY: Table = {
  running: true,
  issuance_stopped: false,
  stopped: false,
};

/**
 * Whether `mode` allows `operation`, ignoring snapshot age and parks. `kind`
 * and `act` are read as own data; a missing `kind` is refused.
 */
export function modeAllows(
  mode: FenceMode,
  operation: FenceOperation
): boolean {
  const kind =
    typeof operation === 'object' && operation !== null
      ? ownValue(operation, 'kind')
      : undefined;
  switch (kind) {
    case 'resolve':
    case 'liveness':
    case 'revoke_user':
      return NOT_STOPPED[mode];
    case 'session_issue':
    case 'credential_mint':
    case 's2s_mint':
    case 'background':
      return RUNNING_ONLY[mode];
    case 'step_up':
    case 'record_factors': {
      const act = ownValue(operation, 'act');
      return (
        mode === 'running' ||
        (mode === 'issuance_stopped' &&
          typeof act === 'string' &&
          ISSUANCE_STOPPED_ACTS.includes(act))
      );
    }
    case 'logout_own':
    case 'revoke_admin':
    case 'security_cleanup':
      return ALL[mode];
    default:
      return false;
  }
}

const ISSUANCE = new Set([
  'session_issue',
  'credential_mint',
  's2s_mint',
  'step_up',
  'record_factors',
]);

/**
 * Decides one operation. The effective mode is the stricter of the
 * snapshot's mode and the floor.
 *
 * - Issuance needs a snapshot at most 10 seconds old, or it is `stale`.
 * - Resolution, liveness and user-path revokes apply the stricter of the
 *   last known mode and the floor while the snapshot is at most 5 minutes
 *   old; past that, or with no usable snapshot, they are `unavailable`,
 *   never signed out. A user-path revoke needs the session resolved first.
 * - Logout, admin revocation and security cleanup run on the floor and the
 *   last known mode, and need no snapshot.
 * - Background work needs a fresh snapshot and parks when the effective mode
 *   is not `running`, `background` is `parked`, or its category is missing
 *   or in `budgetParks`.
 */
export function fenceDecision(input: {
  operation: FenceOperation;
  snapshot: FenceSnapshot | null | undefined;
  floor: FenceMode;
  nowMs: number;
}): FenceDecision {
  const nowMs = ownValue(input, 'nowMs');
  const floorValue = ownValue(input, 'floor');
  const operation = readOperation(ownValue(input, 'operation'));
  const known = readSnapshot(ownValue(input, 'snapshot'), nowMs);
  const floor = isFenceMode(floorValue) ? floorValue : 'stopped';
  const kind = operation?.kind;
  const age = known ? known.age : null;
  const version = known ? known.version : null;
  const mode = stricterMode(known ? known.mode : 'running', floor);
  const refuse = (
    reason: 'forbidden' | 'parked' | 'stale' | 'unavailable',
    reportedMode: FenceMode | null = mode
  ): FenceDecision =>
    Object.freeze({ allowed: false, reason, mode: reportedMode, version });
  const allow = (): FenceDecision =>
    Object.freeze({ allowed: true, mode, version });

  if (!operation) return refuse('forbidden');
  if (typeof kind === 'string' && ISSUANCE.has(kind)) {
    if (age === null || age > FENCE_ISSUANCE_MAX_AGE_MS) {
      return refuse('stale', known ? mode : null);
    }
    return modeAllows(mode, operation) ? allow() : refuse('forbidden');
  }
  if (kind === 'resolve' || kind === 'liveness' || kind === 'revoke_user') {
    if (age === null || age > FENCE_RESOLUTION_MAX_AGE_MS) {
      return refuse('unavailable', known ? mode : null);
    }
    return modeAllows(mode, operation) ? allow() : refuse('forbidden');
  }
  if (kind === 'background') {
    if (age === null || age > FENCE_ISSUANCE_MAX_AGE_MS) {
      return refuse('unavailable', known ? mode : null);
    }
    const category: unknown = operation.category;
    const parked =
      !modeAllows(mode, operation) ||
      known?.parked === true ||
      typeof category !== 'string' ||
      known?.budgetParks.includes(category) === true;
    return parked ? refuse('parked') : allow();
  }
  return modeAllows(mode, operation) ? allow() : refuse('forbidden');
}
