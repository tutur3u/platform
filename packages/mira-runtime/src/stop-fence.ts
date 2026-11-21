/**
 * Stop reasons, each owned by one authority. A fence is closed while any
 * reason remains, and a caller clears only the reasons it owns, so a tenant
 * manager cannot lift an operator suspension or a billing stop.
 */
export const STOP_REASONS = ['tenant', 'operator', 'billing', 'cap'] as const;
export type StopReason = (typeof STOP_REASONS)[number];

export type StopAuthority =
  | 'tenant_manager'
  | 'operator'
  | 'billing'
  | 'system';

const REASON_OWNERS: Record<StopReason, readonly StopAuthority[]> = {
  tenant: ['tenant_manager'],
  operator: ['operator'],
  billing: ['billing'],
  // Spend caps clear when a new period starts or a raised cap is saved,
  // both performed by the system.
  cap: ['system'],
};

export interface StopFenceState {
  reasons: readonly StopReason[];
  generation: number;
}

export const OPEN_FENCE: StopFenceState = { reasons: [], generation: 0 };

export class StopAuthorityError extends Error {
  constructor(
    readonly reason: StopReason,
    readonly authority: StopAuthority
  ) {
    super(`Authority ${authority} cannot change stop reason ${reason}`);
  }
}

export function canChangeReason(
  reason: StopReason,
  authority: StopAuthority
): boolean {
  return REASON_OWNERS[reason].includes(authority);
}

function normalized(reasons: Iterable<StopReason>): StopReason[] {
  const set = new Set(reasons);
  return STOP_REASONS.filter((reason) => set.has(reason));
}

export function addStopReason(
  state: StopFenceState,
  reason: StopReason,
  authority: StopAuthority
): StopFenceState {
  if (!canChangeReason(reason, authority)) {
    throw new StopAuthorityError(reason, authority);
  }
  if (state.reasons.includes(reason)) return state;
  return {
    reasons: normalized([...state.reasons, reason]),
    generation: state.generation + 1,
  };
}

export function clearStopReason(
  state: StopFenceState,
  reason: StopReason,
  authority: StopAuthority
): StopFenceState {
  if (!canChangeReason(reason, authority)) {
    throw new StopAuthorityError(reason, authority);
  }
  if (!state.reasons.includes(reason)) return state;
  return {
    reasons: state.reasons.filter((existing) => existing !== reason),
    generation: state.generation + 1,
  };
}

export function isFenceOpen(state: StopFenceState): boolean {
  return state.reasons.length === 0;
}

export interface FenceSnapshot {
  globalStopped: boolean;
  /** Bumped on every global stop or resume. */
  globalGeneration: number;
  tenant: StopFenceState;
  channel: StopFenceState;
}

export type FenceCheck =
  | {
      open: true;
      globalGeneration: number;
      tenantGeneration: number;
      channelGeneration: number;
    }
  | { open: false; layer: 'global' | 'tenant' | 'channel' };

/** Checked before every model call, every send and every reschedule. */
export function checkFences(snapshot: FenceSnapshot): FenceCheck {
  if (snapshot.globalStopped) return { open: false, layer: 'global' };
  if (!isFenceOpen(snapshot.tenant)) return { open: false, layer: 'tenant' };
  if (!isFenceOpen(snapshot.channel)) return { open: false, layer: 'channel' };
  return {
    open: true,
    globalGeneration: snapshot.globalGeneration,
    tenantGeneration: snapshot.tenant.generation,
    channelGeneration: snapshot.channel.generation,
  };
}

/**
 * Work admitted under one generation must not continue after a stop, even if
 * the fence later reopens: a resumed fence has a higher generation.
 */
export function isAdmissionCurrent(
  admitted: {
    globalGeneration: number;
    tenantGeneration: number;
    channelGeneration: number;
  },
  snapshot: FenceSnapshot
): boolean {
  const check = checkFences(snapshot);
  return (
    check.open &&
    check.globalGeneration === admitted.globalGeneration &&
    check.tenantGeneration === admitted.tenantGeneration &&
    check.channelGeneration === admitted.channelGeneration
  );
}

/** Tenant API routes may only change the tenant-owned reason. */
export function parseTenantRouteStopReason(input: unknown): 'tenant' {
  if (input !== 'tenant') {
    throw new Error('Tenant routes accept only the tenant stop reason');
  }
  return 'tenant';
}
