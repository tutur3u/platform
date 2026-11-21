/**
 * Housekeeping against the device store: the drain alarm, acknowledgements
 * of effects the host ran after a commit, and settling the pending cookie on
 * a response. Each is a compare-and-set write with the commit loop's retry
 * bound and never reduces a mutation.
 */
import { COMMIT_ATTEMPTS } from './commit';
import {
  applyEffectResults,
  type CookieDirective,
  type CookieScope,
  type DrainAlert,
  type DrainTask,
  type EffectResult,
  hasPendingCookie,
  planDrain,
  prune,
  settleCookies,
} from './outbox';
import type { IssuerId } from './registry';
import type {
  DeviceState,
  DeviceStore,
  SessionCredentialIssuer,
} from './types';
import type { UpstreamGrant } from '../provider';

export interface UpstreamRevokePort {
  revokeUpstream(grant: UpstreamGrant): Promise<'ok' | 'failed'>;
}

/**
 * Applies `change` to a fresh draft and compare-and-sets it, retrying on
 * conflict. `change` returns whether the draft changed and a value to return.
 * Returns null when no attempt committed.
 */
async function housekeep<T>(
  store: DeviceStore,
  change: (draft: DeviceState) => { changed: boolean; value: T }
): Promise<{ value: T; committed: boolean } | null> {
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt += 1) {
    let state: DeviceState;
    try {
      state = await store.read();
    } catch {
      continue;
    }
    const draft = structuredClone(state);
    const { changed, value } = change(draft);
    if (!changed) return { value, committed: false };
    draft.version = state.version + 1;
    let written: string;
    try {
      written = await store.write(state.version, draft, []);
    } catch {
      written = 'unknown';
    }
    if (written === 'committed') return { value, committed: true };
  }
  return null;
}

/** Acknowledges effects the host ran right after a commit; failures spend no attempt. */
export async function acknowledgeEffects(
  store: DeviceStore,
  results: readonly EffectResult[],
  nowMs: number
): Promise<boolean> {
  const done = await housekeep(store, (draft) => {
    const before = JSON.stringify(draft.outbox);
    applyEffectResults(draft, results, nowMs, false);
    return { changed: JSON.stringify(draft.outbox) !== before, value: true };
  });
  return done !== null;
}

/**
 * Settles the pending cookie effects on a response to `scope`. Returns the
 * directive the response carries, or null for no cookie change. A failed
 * write leaves the effect pending for a later response.
 */
export async function settleResponseCookie(
  store: DeviceStore,
  nowMs: number,
  scope: CookieScope
): Promise<CookieDirective | null> {
  let state: DeviceState;
  try {
    state = await store.read();
  } catch {
    return null;
  }
  if (!hasPendingCookie(state, scope)) return null;
  const done = await housekeep(store, (draft) => {
    const directive = settleCookies(draft, nowMs, scope);
    return { changed: true, value: directive };
  });
  return done?.committed ? done.value : null;
}

export type DrainPorts = {
  upstream: UpstreamRevokePort;
  issuers: Readonly<Record<IssuerId, SessionCredentialIssuer>>;
};

async function runTask(
  task: DrainTask,
  state: DeviceState,
  ports: DrainPorts
): Promise<EffectResult> {
  try {
    if (task.effect === 'upstream') {
      const grant = state.outbox[task.key]?.upstream;
      if (!grant) return { ...task, ok: true };
      return {
        ...task,
        ok: (await ports.upstream.revokeUpstream(grant)) === 'ok',
      };
    }
    const issuer = ports.issuers[task.issuer];
    if (!issuer) return { ...task, ok: false };
    const outcome =
      task.before === null
        ? await issuer.revokeForSession(task.sessionId)
        : await issuer.revokeForSessionBefore(task.sessionId, task.before);
    return { ...task, ok: outcome === 'ok' };
  } catch {
    return { ...task, ok: false };
  }
}

export type DrainReport = {
  attempted: number;
  alerts: DrainAlert[];
  committed: boolean;
};

/**
 * One drain alarm: retries every due `upstream` and `credentials` effect on
 * its own attempt count, then prunes. Cookie effects are never run or
 * counted here; they ride the next response.
 */
export async function runDrain(
  store: DeviceStore,
  ports: DrainPorts,
  nowMs: number
): Promise<DrainReport> {
  let state: DeviceState;
  try {
    state = await store.read();
  } catch {
    return { attempted: 0, alerts: [], committed: false };
  }
  const tasks = planDrain(state, nowMs);
  const results: EffectResult[] = [];
  for (const task of tasks) results.push(await runTask(task, state, ports));
  // Alerts from every attempt: a retry after a lost acknowledgement finds the
  // effect already abandoned and would otherwise drop its alert. An alert
  // whose write never landed is raised again by the next drain.
  const alerts = new Map<string, DrainAlert>();
  const done = await housekeep(store, (draft) => {
    const before = JSON.stringify([draft.outbox, Object.keys(draft.sessions)]);
    for (const alert of applyEffectResults(draft, results, nowMs, true)) {
      alerts.set(`${alert.key}|${alert.effect}`, alert);
    }
    const pruned = prune(draft, nowMs);
    const after = JSON.stringify([draft.outbox, Object.keys(draft.sessions)]);
    return { changed: pruned || before !== after, value: null };
  });
  return {
    attempted: tasks.length,
    alerts: [...alerts.values()],
    committed: done?.committed ?? false,
  };
}
