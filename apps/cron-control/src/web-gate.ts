// This gate is shared by Vercel and Cloudflare at the processor boundary.
// An expired lease is an UNKNOWN write, never permission to replay it.
export const WEB_JOBS = {
  'web-notification-batches': 15,
  'web-post-email-queue': 30,
  'web-report-automation': 15,
  'web-topic-announcements': 15,
  'web-deadline-reminders': 5,
} as const;
export type WebJobId = keyof typeof WEB_JOBS;
export type WebOwner = 'vercel' | 'cloudflare';
export const WEB_LEASE_MS = 15 * 60_000;
export type WebGateState = {
  owner: WebOwner;
  stopped: boolean;
  lastSlot: number;
  active: { id: string; slot: number; until: number } | null;
};
export type WebGateAction =
  | { kind: 'acquire'; owner: WebOwner; id: string; slot: number }
  | { kind: 'complete'; id: string }
  | { kind: 'owner'; owner: WebOwner }
  | { kind: 'stop' }
  | { kind: 'resume' }
  | { kind: 'resolve'; id: string }
  | { kind: 'status' };
export interface WebGateStore {
  read(id: WebJobId): WebGateState | null;
  write(id: WebJobId, state: WebGateState): void;
}
export function isWebJob(id: string): id is WebJobId {
  return Object.hasOwn(WEB_JOBS, id);
}
export function webGateAction(
  store: WebGateStore,
  job: WebJobId,
  action: WebGateAction,
  now: number
) {
  const state = store.read(job) ?? {
    owner: 'vercel',
    stopped: false,
    lastSlot: -1,
    active: null,
  };
  const result = (ok: boolean, reason: string) => ({ ok, reason, state });
  switch (action.kind) {
    case 'status':
      return result(true, 'status');
    case 'stop':
      state.stopped = true;
      break;
    case 'resume':
      if (state.active) return result(false, 'unresolved-run');
      state.stopped = false;
      break;
    case 'owner':
      if (state.active) return result(false, 'unresolved-run');
      state.owner = action.owner;
      break;
    case 'resolve':
      if (
        !state.stopped ||
        state.active?.id !== action.id ||
        state.active.until > now
      )
        return result(false, 'reconciliation-required');
      state.active = null;
      break;
    case 'complete':
      if (state.active?.id !== action.id) return result(false, 'stale-run');
      state.active = null;
      break;
    case 'acquire': {
      if (state.stopped) return result(false, 'stopped');
      if (state.owner !== action.owner) return result(false, 'owner');
      if (state.active) return result(false, 'unresolved-run');
      const interval = WEB_JOBS[job] * 60_000;
      if (
        !Number.isSafeInteger(action.slot) ||
        action.slot % interval !== 0 ||
        action.slot > now ||
        now - action.slot >= interval + 120_000
      )
        return result(false, 'invalid-slot');
      if (action.slot <= state.lastSlot) return result(false, 'duplicate');
      state.lastSlot = action.slot;
      state.active = {
        id: action.id,
        slot: action.slot,
        until: now + WEB_LEASE_MS,
      };
      break;
    }
  }
  store.write(job, state);
  return result(true, action.kind);
}
