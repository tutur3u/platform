import type { SelfFailure } from './self-api';

export const SELF_RENEW_MS = 30_000;
export const SELF_RETRY_MS = 5_000;
export const SELF_RATE_LIMIT_MS = 30_000;

type Terminal = Exclude<SelfFailure, 'retry' | 'lease_expired'>;

/**
 * Stream lifecycle for one participant. A refusal is terminal for the join
 * key it happened under; only an ineligible period or a new key (a new
 * session or a rejoin) opens a stream again.
 */
export type SelfLifecycle =
  | { kind: 'idle' }
  | { kind: 'opening'; key: string }
  | { kind: 'backoff'; key: string; attempt: number }
  | {
      kind: 'open';
      key: string;
      streamId: string;
      consentRevision: number;
      leaseExpiresAt: number;
      /** A renewal failed but the lease is still valid. */
      degraded: boolean;
    }
  | { kind: Terminal; key: string };

export type SelfLifecycleEvent =
  | { type: 'eligible'; key: string }
  | { type: 'ineligible' }
  | {
      type: 'opened';
      streamId: string;
      consentRevision: number;
      leaseExpiresAt: number;
    }
  | { type: 'open_failed'; failure: SelfFailure; attempt?: number }
  | { type: 'backoff_elapsed' }
  | { type: 'renewed'; leaseExpiresAt: number }
  | { type: 'renew_failed'; failure: SelfFailure; now: number }
  /** The server says the stream's lease lapsed; open a new stream. */
  | { type: 'lease_expired' }
  | { type: 'refused'; failure: Terminal };

const isTerminal = (
  state: SelfLifecycle
): state is Extract<SelfLifecycle, { kind: Terminal }> =>
  state.kind === 'refused' ||
  state.kind === 'not_eligible' ||
  state.kind === 'unavailable';

export function nextSelfLifecycle(
  state: SelfLifecycle,
  event: SelfLifecycleEvent
): SelfLifecycle {
  switch (event.type) {
    case 'ineligible':
      return { kind: 'idle' };
    case 'eligible':
      if (state.kind === 'idle') return { kind: 'opening', key: event.key };
      if (state.key !== event.key) return { kind: 'opening', key: event.key };
      return state;
    case 'opened':
      return state.kind === 'opening'
        ? {
            kind: 'open',
            key: state.key,
            streamId: event.streamId,
            consentRevision: event.consentRevision,
            leaseExpiresAt: event.leaseExpiresAt,
            degraded: false,
          }
        : state;
    case 'open_failed':
      if (state.kind !== 'opening') return state;
      return event.failure === 'retry' || event.failure === 'lease_expired'
        ? {
            kind: 'backoff',
            key: state.key,
            attempt: (event.attempt ?? 0) + 1,
          }
        : { kind: event.failure, key: state.key };
    case 'backoff_elapsed':
      return state.kind === 'backoff'
        ? { kind: 'opening', key: state.key }
        : state;
    case 'renewed':
      return state.kind === 'open'
        ? { ...state, leaseExpiresAt: event.leaseExpiresAt, degraded: false }
        : state;
    case 'renew_failed':
      if (state.kind !== 'open') return state;
      if (event.failure === 'lease_expired')
        return { kind: 'opening', key: state.key };
      if (event.failure !== 'retry')
        return { kind: event.failure, key: state.key };
      // A lease that lapsed cannot admit chunks; start over with a new stream.
      return event.now >= state.leaseExpiresAt
        ? { kind: 'opening', key: state.key }
        : { ...state, degraded: true };
    case 'lease_expired':
      return state.kind === 'open'
        ? { kind: 'opening', key: state.key }
        : state;
    case 'refused':
      return state.kind === 'idle' || isTerminal(state)
        ? state
        : { kind: event.failure, key: state.key };
  }
}

/** What this participant is told about their own capture. */
export type SelfCaptureState =
  | { kind: 'off' }
  | { kind: 'capturing' }
  | { kind: 'paused' }
  | { kind: 'unsupported' }
  | { kind: 'guest' }
  | { kind: 'app' }
  | { kind: 'stopped' };

export function selfCaptureViewOf(lifecycle: SelfLifecycle): SelfCaptureState {
  switch (lifecycle.kind) {
    case 'idle':
      return { kind: 'off' };
    case 'opening':
    case 'backoff':
      return { kind: 'paused' };
    case 'open':
      return lifecycle.degraded ? { kind: 'paused' } : { kind: 'capturing' };
    case 'not_eligible':
      return { kind: 'guest' };
    case 'lease_expired':
      return state.kind === 'open'
        ? { kind: 'opening', key: state.key }
        : state;
    case 'refused':
    case 'unavailable':
      return { kind: 'stopped' };
  }
}
