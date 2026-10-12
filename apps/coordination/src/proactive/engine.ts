import { admissionReason, readAuthority } from './authority';
import {
  LEASE_MS,
  MAX_LIFETIME_MS,
  type Authority,
  type DueJob,
  type Identity,
  type JobState,
  type JobStore,
  type Outcome,
} from './contracts';

export function validJob(job: DueJob): boolean {
  const id = /^[a-zA-Z0-9_-]{1,100}$/;
  return (
    id.test(job.actorId) &&
    id.test(job.workspaceId) &&
    id.test(job.occurrenceId) &&
    id.test(job.sourceVersion) &&
    id.test(job.consentVersion) &&
    job.action === 'reflection-dry-run' &&
    Number.isSafeInteger(job.dueAt) &&
    job.dueAt >= 0 &&
    Number.isSafeInteger(job.expiresAt) &&
    job.expiresAt > job.dueAt &&
    job.expiresAt - job.dueAt <= MAX_LIFETIME_MS
  );
}

export function sameJob(left: DueJob, right: DueJob): boolean {
  return (
    left.actorId === right.actorId &&
    left.workspaceId === right.workspaceId &&
    left.occurrenceId === right.occurrenceId &&
    left.sourceVersion === right.sourceVersion &&
    left.consentVersion === right.consentVersion &&
    left.dueAt === right.dueAt &&
    left.expiresAt === right.expiresAt &&
    left.action === right.action
  );
}

export function nextWake(state: JobState | null): number | null {
  if (!state) return null;
  if (state.phase.kind === 'pending') return state.job.dueAt;
  if (state.phase.kind === 'leased') return state.phase.until;
  return null;
}

export class DueJobEngine {
  constructor(
    private readonly store: JobStore,
    private readonly authority: Authority,
    private readonly clock: () => number,
    private readonly leaseToken: () => string
  ) {}

  async submit(job: DueJob): Promise<Outcome> {
    if (!validJob(job)) return { kind: 'denied', reason: 'invalid-job' };
    const now = this.clock();
    if (now >= job.expiresAt) return { kind: 'denied', reason: 'expired' };
    let snapshot;
    try {
      snapshot = await readAuthority(this.authority, job, now);
    } catch {
      return { kind: 'denied', reason: 'authority-unavailable' };
    }
    return this.store.transaction(() => {
      const existing = this.store.read();
      if (existing)
        return sameJob(existing.job, job)
          ? { kind: 'state', state: existing }
          : { kind: 'denied', reason: 'identity-conflict' };
      const reason = admissionReason(job, snapshot, this.clock(), 0);
      if (reason) return { kind: 'denied', reason };
      const state: JobState = { job, runs: 0, phase: { kind: 'pending' } };
      this.store.write(state);
      return { kind: 'state', state };
    });
  }

  async execute(): Promise<Outcome> {
    const initial = this.store.read();
    if (!initial) return { kind: 'denied', reason: 'missing-job' };
    if (initial.phase.kind === 'leased') {
      if (initial.phase.until > this.clock())
        return { kind: 'waiting', at: initial.phase.until };
      return this.store.transaction(() => {
        const current = this.store.read();
        if (!current) return { kind: 'denied', reason: 'missing-job' };
        if (
          current.phase.kind === 'leased' &&
          current.phase.until <= this.clock()
        ) {
          const state: JobState = {
            ...current,
            phase: { kind: 'unknown', acceptance: 'unknown' },
          };
          this.store.write(state);
          return { kind: 'state', state };
        }
        return { kind: 'state', state: current };
      });
    }
    if (initial.phase.kind !== 'pending')
      return { kind: 'state', state: initial };
    if (initial.job.dueAt > this.clock())
      return { kind: 'waiting', at: initial.job.dueAt };
    let snapshot;
    try {
      snapshot = await readAuthority(this.authority, initial.job, this.clock());
    } catch {
      return this.stop(initial.job, 'authority-unavailable');
    }
    const token = this.leaseToken();
    const claim = this.store.transaction<Outcome>(() => {
      const current = this.store.read();
      if (!current || !sameJob(current.job, initial.job))
        return { kind: 'denied', reason: 'identity-conflict' };
      if (current.phase.kind !== 'pending')
        return { kind: 'state', state: current };
      const now = this.clock();
      const reason =
        now >= current.job.expiresAt
          ? 'expired'
          : admissionReason(current.job, snapshot, now, current.runs);
      if (reason) {
        const state: JobState = {
          ...current,
          phase: { kind: 'cancelled', reason },
        };
        this.store.write(state);
        return { kind: 'state', state };
      }
      const state: JobState = {
        ...current,
        runs: current.runs + 1,
        phase: { kind: 'leased', token, until: now + LEASE_MS },
      };
      this.store.write(state);
      return { kind: 'state', state };
    });
    if (claim.kind !== 'state' || claim.state.phase.kind !== 'leased')
      return claim;
    if (claim.state.phase.token !== token) return claim;
    // The first slice computes metadata only. There is no journal or provider I/O.
    return this.store.transaction(() => {
      const current = this.store.read();
      if (!current) return { kind: 'denied', reason: 'missing-job' };
      if (current.phase.kind !== 'leased' || current.phase.token !== token)
        return { kind: 'state', state: current };
      const state: JobState = {
        ...current,
        phase: {
          kind: 'completed',
          result: {
            kind: 'reflection-dry-run',
            occurrenceId: current.job.occurrenceId,
            sourceVersion: current.job.sourceVersion,
            visibility: 'private',
            sourceRead: false,
            providerCalled: false,
          },
        },
      };
      this.store.write(state);
      return { kind: 'state', state };
    });
  }

  stop(identity: Identity, reason: string): Outcome {
    return this.store.transaction(() => {
      const current = this.store.read();
      if (!current) return { kind: 'denied', reason: 'missing-job' };
      if (
        current.job.actorId !== identity.actorId ||
        current.job.workspaceId !== identity.workspaceId
      )
        return { kind: 'denied', reason: 'identity-conflict' };
      if (current.phase.kind !== 'pending' && current.phase.kind !== 'leased')
        return { kind: 'state', state: current };
      const state: JobState = {
        ...current,
        phase:
          current.phase.kind === 'leased'
            ? { kind: 'unknown', acceptance: 'unknown' }
            : { kind: 'cancelled', reason },
      };
      this.store.write(state);
      return { kind: 'state', state };
    });
  }
}
